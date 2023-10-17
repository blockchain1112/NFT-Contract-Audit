// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "./IERC4906.sol";

interface INFT is IERC4906 {
    struct Withdraw {
        address payable walletAddress;
        uint8 percentage;
    }

    struct StakeOption {
        uint256 interval;
        uint256 reward;
        uint32 intervalExtensionLimit;
        bool enabled;
    }

    struct Stake {
        uint256 option;
        uint256 startTime;
    }

    struct TokenStakeReward {
        uint256 tokenId;
        uint256 reward;
        uint256 rewardCount;
    }

    function privateMint(uint256 amount, bytes memory signature) external payable;
    
    function mint(uint256 amount) external payable;

    function togglePublicSale() external;

    function toggleMintPaused() external;

    function blacklistSignatures(bytes[] memory signatures) external;

    function setBaseURI(string memory baseUri) external;

    function setPhase(uint8 phase) external;

    function setMintLimitByWallet(uint32[] memory phasesLimit, uint32 publicSaleLimit) external;

    function setPublicSaleCost(uint256 cost) external;

    function setPhaseCosts(uint256[] memory costs) external;

    function withdraw(Withdraw[] calldata withdraws, string memory requester) external;

    function verifySignature(address walletAddress, uint8 phase, bytes memory signature) external returns(bool);

    function totalNumberMinted(address owner) external returns (uint256);

    function reveal() external;

    function refreshMetadata() external;

    function addStakeOption(uint256 interval, uint256 reward, uint32 intervalExtensionLimit, bool enabled) external;

    function updateStakeOption(uint256 option, uint256 interval, uint256 reward, uint32 intervalExtensionLimit, bool enabled) external;

    function updateStakeLimitPerToken(uint256 _stakeLimitPerToken) external;

    function toggleAllStakeOptions(bool enabled) external;

    function stake(uint256[] memory tokenIds, uint256 option) external;

    function unstake(uint256[] memory tokenIds) external;

    function calculateTokenStakeRewards(uint256[] memory tokenIds) external view returns (TokenStakeReward[] memory stakeRewards);

    event Blacklisted(bytes[] signatures);

    event Revealed();

    event MintPausedToggleUpdated(bool mintPaused);

    event PublicSaleEnabledToggleUpdated(bool publicSaleEnabled);
    
    event PhaseChanged(uint8 phase);

    event Staked(uint256[] tokenIds, uint256 option);

    event Unstaked(uint256 tokenId, uint256 option, uint256 startTime, uint256 endTime, uint256 reward, uint256 rewardCount, uint256 totalTokenStakeCount);

    event StakeOptionUpdated(uint256 option, uint256 interval, uint256 reward, uint32 intervalExtensionLimit, bool enabled);

    event StakeLimitPerTokenChanged(uint256 stakeLimitPerToken);

    event Withdrawn(Withdraw[] withdraws, string requester);
}