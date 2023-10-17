// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "erc721a/contracts/ERC721A.sol";
import "./INFT.sol";

contract NFT is INFT, ERC721A, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    address private _operator;
    string private _baseUri;
    string private _networkCode;

    uint32[] public phaseMintLimitByWallet;
    uint32 public publicSaleMintLimitByWallet;
    uint32 public totalSupplyLimit;
    uint8 public currentPhase;

    bool public publicSaleEnabled;
    bool public mintPaused;
    bool public revealed;

    uint256 public publicSaleCost;
    uint256 public stakeLimitPerToken;

    uint256[] public phaseCosts;
    StakeOption[] public stakeOptions;

    mapping(bytes => bool) public blacklist;
    mapping(uint256 => address) public minter;
    mapping(uint256 => uint256) public tokenStakeCount;
    mapping(uint256 => Stake) public tokenStake;
    mapping(address => mapping(uint8 => uint256)) public numberMintedByPhase;
    mapping(address => uint256) public numberMintedByPublicSale;

    constructor(
        string memory _name,
        string memory _symbol,
        uint32[] memory _phaseMintLimitByWallet,
        uint32 _publicSaleMintLimitByWallet,
        uint32 _totalSupplyLimit,
        uint8 _initialPhase,
        uint256[] memory _phaseCosts,
        uint256 _publicSaleCost,
        address operator,
        string memory baseUri,
        string memory networkCode,
        bool _mintPaused,
        uint256 _stakeLimitPerToken,
        StakeOption[] memory _stakeOptions
    ) ERC721A(_name, _symbol) {
        require(_phaseCosts.length > _initialPhase, "Invalid current phase");
        phaseMintLimitByWallet = _phaseMintLimitByWallet;
        publicSaleMintLimitByWallet = _publicSaleMintLimitByWallet;
        currentPhase = _initialPhase;
        publicSaleCost = _publicSaleCost;
        totalSupplyLimit = _totalSupplyLimit;
        _operator = operator;
        _baseUri = baseUri;
        _networkCode = networkCode;
        mintPaused = _mintPaused;
        stakeLimitPerToken = _stakeLimitPerToken;

        for (uint256 i = 0; i < _phaseCosts.length; i++) {
            phaseCosts.push(_phaseCosts[i]);
        }

        for (uint256 i = 0; i < _stakeOptions.length; i++) {
            require(
                _stakeOptions[i].interval > 0,
                "Invalid stake option"
            );
            stakeOptions.push(_stakeOptions[i]);
        }
    }

    function privateMint(
        uint256 amount,
        bytes memory signature
    ) external payable {
        require(!blacklist[signature], "Signature is blacklisted");
        require(!publicSaleEnabled, "Public sale is enabled");
        require(!mintPaused, "Minting is paused");
        bytes32 message = keccak256(
            abi.encodePacked(address(this), msg.sender, currentPhase)
        );
        address signer = message.toEthSignedMessageHash().recover(signature);
        require(signer == _operator, "Invalid signature");
        require(
            msg.value == phaseCosts[currentPhase] * amount,
            "Invalid cost amount"
        );
        _mintTokens(msg.sender, amount);
    }

    function mint(uint256 amount) external payable {
        require(publicSaleEnabled, "Public sale is disabled");
        require(!mintPaused, "Minting is paused");
        require(msg.value == publicSaleCost * amount, "Invalid cost amount");
        _mintTokens(msg.sender, amount);
    }

    function togglePublicSale() external onlyOwner {
        publicSaleEnabled = !publicSaleEnabled;
        emit PublicSaleEnabledToggleUpdated(publicSaleEnabled);
    }

    function toggleMintPaused() external onlyOwner {
        mintPaused = !mintPaused;
        emit MintPausedToggleUpdated(mintPaused);
    }

    function blacklistSignatures(bytes[] memory signatures) external onlyOwner {
        for (uint256 i = 0; i < signatures.length; i++) {
            blacklist[signatures[i]] = true;
        }

        emit Blacklisted(signatures);
    }

    function setPhase(uint8 phase) external onlyOwner {
        require(phaseCosts.length > phase, "Invalid phase");
        currentPhase = phase;
        emit PhaseChanged(currentPhase);
    }

    function withdraw(
        Withdraw[] calldata withdraws,
        string memory requester
    ) external onlyOwner {
        uint256 totalBalance = address(this).balance;
        require(totalBalance > 0, "Not enough balance");

        uint8 totalPercentage = 0;
        for (uint256 i = 0; i < withdraws.length; i++) {
            totalPercentage += withdraws[i].percentage;
        }
        require(totalPercentage == 100, "Invalid total percentage");

        for (uint256 i = 0; i < withdraws.length; i++) {
            uint256 amount = (totalBalance / 100) * withdraws[i].percentage;
            (bool sent,) = withdraws[i].walletAddress.call{value: amount}("");
            require(sent, "Withdraw failed");
        }

        emit Withdrawn(withdraws, requester);
    }

    function totalNumberMinted(address owner) external view returns (uint256) {
        return _numberMinted(owner);
    }

    function numberMinted(address owner) public view returns (uint256) {
        return
            publicSaleEnabled
                ? numberMintedByPublicSale[owner]
                : numberMintedByPhase[owner][currentPhase];
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();

        string memory baseURI = _baseURI();
        return
            bytes(baseURI).length > 0
                ? string(
                abi.encodePacked(
                    baseURI,
                    "/collection-launches/0x",
                    toAsciiString(address(this)),
                    "/tokens/",
                    Strings.toString(tokenId),
                    "/metadata?network=",
                    _networkCode
                )
            )
                : "";
    }

    function setBaseURI(string memory baseUri) external onlyOwner {
        _baseUri = baseUri;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public pure override returns (bool) {
        // The interface IDs are constants representing the first 4 bytes
        // of the XOR of all function selectors in the interface.
        // See: [ERC165](https://eips.ethereum.org/EIPS/eip-165)
        // (e.g. `bytes4(i.functionA.selector ^ i.functionB.selector ^ ...)`)
        return
            interfaceId == 0x01ffc9a7 || // ERC165 interface ID for ERC165.
            interfaceId == 0x80ac58cd || // ERC165 interface ID for ERC721.
            interfaceId == 0x49064906 || // ERC165 interface ID for ERC4906.
            interfaceId == 0x5b5e139f; // ERC165 interface ID for ERC721Metadata.
    }

    function verifySignature(
        address walletAddress,
        uint8 phase,
        bytes memory signature
    ) external view returns (bool) {
        bytes32 message = keccak256(
            abi.encodePacked(address(this), walletAddress, phase)
        );
        address signer = message.toEthSignedMessageHash().recover(signature);
        return signer == _operator;
    }

    function setPublicSaleCost(uint256 cost) external onlyOwner {
        publicSaleCost = cost;
    }

    function setMintLimitByWallet(uint32[] memory phasesLimit, uint32 publicSaleLimit) external onlyOwner {
        require(phaseMintLimitByWallet.length == phasesLimit.length, "Invalid mint limit length");
        for (uint256 i = 0; i < phasesLimit.length; i++) {
            phaseMintLimitByWallet[i] = phasesLimit[i];
        }

        publicSaleMintLimitByWallet = publicSaleLimit;
    }

    function setPhaseCosts(uint256[] memory costs) external onlyOwner {
        require(phaseCosts.length == costs.length, "Invalid cost length");
        for (uint256 i = 0; i < costs.length; i++) {
            phaseCosts[i] = costs[i];
        }
    }

    function reveal() external onlyOwner {
        require(!revealed, "Already revealed");
        revealed = true;
        emit Revealed();
    }

    function refreshMetadata() external onlyOwner {
        uint256 nextTokenId = _nextTokenId();
        require(nextTokenId > 1, "Not minted yet");
        emit BatchMetadataUpdate(_startTokenId(), nextTokenId - 1);
    }

    function updateStakeLimitPerToken(
        uint256 _stakeLimitPerToken
    ) external onlyOwner {
        stakeLimitPerToken = _stakeLimitPerToken;
        emit StakeLimitPerTokenChanged(stakeLimitPerToken);
    }

    function addStakeOption(
        uint256 interval,
        uint256 reward,
        uint32 intervalExtensionLimit,
        bool enabled
    ) external onlyOwner {
        require(interval > 0, "Invalid interval");
        stakeOptions.push(
            StakeOption(interval, reward, intervalExtensionLimit, enabled)
        );
        emit StakeOptionUpdated(
            stakeOptions.length - 1,
            interval,
            reward,
            intervalExtensionLimit,
            enabled
        );
    }

    function toggleAllStakeOptions(bool enabled) external onlyOwner {
        for (uint256 i = 0; i < stakeOptions.length; i++) {
            stakeOptions[i].enabled = enabled;
            emit StakeOptionUpdated(
                i,
                stakeOptions[i].interval,
                stakeOptions[i].reward,
                stakeOptions[i].intervalExtensionLimit,
                stakeOptions[i].enabled
            );
        }
    }

    function updateStakeOption(
        uint256 option,
        uint256 interval,
        uint256 reward,
        uint32 intervalExtensionLimit,
        bool enabled
    ) external onlyOwner {
        require(option < stakeOptions.length, "Invalid stake option");
        require(interval > 0, "Invalid interval");
        stakeOptions[option].interval = interval;
        stakeOptions[option].reward = reward;
        stakeOptions[option].intervalExtensionLimit = intervalExtensionLimit;
        stakeOptions[option].enabled = enabled;
        emit StakeOptionUpdated(
            option,
            interval,
            reward,
            intervalExtensionLimit,
            enabled
        );
    }

    function stake(uint256[] memory tokenIds, uint256 option) external {
        require(stakeOptions[option].enabled, "Stake option is disabled");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(ownerOf(tokenIds[i]) == msg.sender, "Invalid token owner");
            require(
                tokenStakeCount[tokenIds[i]] < stakeLimitPerToken,
                "Out of stake limit per token"
            );
            require(
                tokenStake[tokenIds[i]].startTime == 0,
                "Token already staked"
            );
            tokenStake[tokenIds[i]].option = option;
            tokenStake[tokenIds[i]].startTime = block.timestamp;
        }

        emit Staked(tokenIds, option);
    }

    function unstake(uint256[] memory tokenIds) external nonReentrant {
        uint256 totalReward = 0;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(
                tokenStake[tokenIds[i]].startTime > 0,
                "Token is not staked"
            );
            require(
                ownerOf(tokenIds[i]) == msg.sender,
                "Only the owner can unstake it"
            );

            (uint256 rewardCount, uint256 reward) = _calculateTokenStakeReward(tokenIds[i]);
            if (rewardCount > 0) {
                tokenStakeCount[tokenIds[i]] += rewardCount;
                totalReward += reward;
            }

            emit Unstaked(
                tokenIds[i],
                tokenStake[tokenIds[i]].option,
                tokenStake[tokenIds[i]].startTime,
                block.timestamp,
                reward,
                rewardCount,
                tokenStakeCount[tokenIds[i]]
            );
            delete tokenStake[tokenIds[i]];
        }

        if (totalReward > 0) {
            (bool sent,) = msg.sender.call{value: totalReward}("");
            require(sent, "Reward transfer failed");
        }
    }

    function calculateTokenStakeRewards(uint256[] memory tokenIds) external view returns (TokenStakeReward[] memory stakeRewards) {
        stakeRewards = new TokenStakeReward[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            require(tokenStake[tokenId].startTime > 0, "Token is not staked");
            (uint256 rewardCount, uint256 reward) = _calculateTokenStakeReward(tokenId);
            stakeRewards[i].tokenId = tokenId;
            stakeRewards[i].rewardCount = rewardCount;
            stakeRewards[i].reward = reward;
        }

        return stakeRewards;
    }

    receive() external payable {}

    fallback() external payable {}

    function _beforeTokenTransfers(
        address /*from*/,
        address /*to*/,
        uint256 startTokenId,
        uint256 /*quantity*/
    ) internal view override {
        require(tokenStake[startTokenId].startTime == 0, "Token is staked");
    }

    function _mintTokens(address walletAddress, uint256 amount) internal {
        uint256 fromTokenId = _nextTokenId();
        uint256 toTokenId = fromTokenId + amount;
        _mint(walletAddress, amount);

        if (publicSaleEnabled) {
            numberMintedByPublicSale[walletAddress] += amount;
        } else {
            numberMintedByPhase[walletAddress][currentPhase] += amount;
        }
        _checkMintLimit();

        for (uint256 i = fromTokenId; i < toTokenId; i++) {
            minter[i] = walletAddress;
        }
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseUri;
    }

    function _startTokenId() internal pure override returns (uint256) {
        return 1;
    }

    function _checkMintLimit() internal view {
        require(
            totalSupplyLimit >= _totalMinted(),
            "Out of total supply limit"
        );
        uint32 mintLimit = publicSaleEnabled
            ? publicSaleMintLimitByWallet
            : phaseMintLimitByWallet[currentPhase];
        require(mintLimit >= numberMinted(msg.sender), "Out of max mint limit");
    }

    function _calculateTokenStakeReward(uint256 tokenId) internal view returns (uint256 rewardCount, uint256 reward) {
        if (ownerOf(tokenId) == minter[tokenId]) {
            StakeOption memory stakeOption = stakeOptions[tokenStake[tokenId].option];
            rewardCount = (block.timestamp - tokenStake[tokenId].startTime) / stakeOption.interval;

            if (rewardCount > stakeOption.intervalExtensionLimit + 1) {
                rewardCount = stakeOption.intervalExtensionLimit + 1;
            }

            if (rewardCount > stakeLimitPerToken - tokenStakeCount[tokenId]) {
                rewardCount = stakeLimitPerToken - tokenStakeCount[tokenId];
            }

            reward = rewardCount * stakeOption.reward;
        }
        return (rewardCount, reward);
    }

    function toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2 ** (8 * (19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2 * i] = char(hi);
            s[2 * i + 1] = char(lo);
        }
        return string(s);
    }

    function char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
}
