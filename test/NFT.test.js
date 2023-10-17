const HDWalletProvider = require("@truffle/hdwallet-provider");
const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const nftJson = require('./../build/contracts/NFT.json');

var ethers = require('ethers');
var crypto = require('crypto');
const rlp = require('rlp')
var ethersBytes = require('@ethersproject/bytes');

const mnemonicPhrase = "situate source awake strong cereal knee among palace sadness quarter myself crunch";
const provider = new HDWalletProvider({
    mnemonic: {
        phrase: mnemonicPhrase
    },
    providerOrUrl: ganache.provider({ mnemonic: mnemonicPhrase })
});

const web3 = new Web3(provider);
const web3Provider = new ethers.providers.Web3Provider(provider);

let nftContract;
let contractOwner;
let minter;
let operator, operatorSigner;
let withdrawWallet1, withdrawWallet2;
describe('NFT', () => {
    beforeEach(async () => {
        const accounts = await web3.eth.getAccounts();
        contractOwner = accounts[0];
        minter = accounts[1];
        operator = accounts[2];
        operatorSigner = web3Provider.getSigner(operator);
        withdrawWallet1 = accounts[3];
        withdrawWallet2 = accounts[4];
        nftContract = await deployContract();
    });

    context('privateMint', () => {
        context('when limits are not exceeded', () => {
            context('when signature is not blacklisted', () => {
                context('when public sale is enabled', () => {
                    it('should revert', async () => {
                        // given
                        await nftContract.methods.togglePublicSale().send({ from: contractOwner });

                        // when & then
                        await truffleAssert.reverts(
                            nftContract.methods.privateMint(1, []).send({ from: minter }),
                            'Public sale is enabled');
                    })
                });

                context('when public sale is disabled', () => {
                    context('when signature is invalid', () => {
                        it('should revert', async () => {
                            // given
                            const signature = await signWhitelisted(minter, 100);

                            // when & then
                            await truffleAssert.reverts(
                                nftContract.methods.privateMint(1, signature).send({ from: minter }),
                                'Invalid signature');
                        })
                    });

                    context('when signature is valid', () => {
                        context('when amount sent is not equal to phase cost', () => {
                            it('should revert', async () => {
                                // given
                                const signature = await signWhitelisted(minter, 0);

                                // when & then
                                await truffleAssert.reverts(
                                    nftContract.methods.privateMint(1, signature).send({ from: minter, value: 100 }),
                                    'Invalid cost amount');
                            });
                        });

                        context('when cost amount equals to phase cost', () => {
                            it('should mint', async () => {
                                // given
                                const signature = await signWhitelisted(minter, 0);

                                // when
                                await nftContract.methods.privateMint(2, signature).send({ from: minter, value: 20000000 });

                                // then
                                const balance = await nftContract.methods.balanceOf(minter).call();
                                assert.equal(balance, 2);
                            });
                        });

                        context('when successful private mint', () => {
                            it('should update number minted by phase', async () => {
                                // given
                                const signature = await signWhitelisted(minter, 0);

                                // when
                                await nftContract.methods.privateMint(2, signature).send({ from: minter, value: 20000000 });

                                // then
                                const numberMinted = await nftContract.methods.numberMinted(minter).call();
                                assert.equal(numberMinted, 2);
                            });
                        });
                    });
                });
            });

            context('when signature is blacklisted', () => {
                it('should revert', async () => {
                    // given
                    const signature = await signWhitelisted(minter, 0);
                    await nftContract.methods.blacklistSignatures([signature]).send({ from: contractOwner });

                    // when & then
                    await truffleAssert.reverts(
                        nftContract.methods.privateMint(2, signature).send({ from: minter }),
                        'Signature is blacklisted');
                });
            });
        });

        context('when total supply limit is being exceeded', () => {
            it('should revert', async () => {
                // given
                const contract = await deployContract(1);
                const signature = await signWhitelisted(minter, 0, contract._address);

                // when & then
                await truffleAssert.reverts(
                    contract.methods.privateMint(2, signature).send({ from: minter, value: 20000000 }),
                    'Out of total supply limit');
            });
        });

        context('when mint limit by wallet is being exceeded', () => {
            it('should revert', async () => {
                // given
                const signature = await signWhitelisted(minter, 0);

                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.privateMint(11, signature).send({ from: minter, value: 110000000 }),
                    'Out of max mint limit');
            });
        });
    });

    context('mint', () => {
        context('when limits are not exceeded', () => {
            context('when public sale is disabled', () => {
                it('should revert', async () => {
                    // when & then
                    await truffleAssert.reverts(
                        nftContract.methods.mint(1).send({ from: minter }),
                        'Public sale is disabled');
                })
            });

            context('when public sale is enabled', () => {
                beforeEach(async () => {
                    await nftContract.methods.togglePublicSale().send({ from: contractOwner });
                });

                context('when amount sent is not equal to public sale cost', () => {
                    it('should revert', async () => {
                        // when & then
                        await truffleAssert.reverts(
                            nftContract.methods.mint(1).send({ from: minter, value: 100 }),
                            'Invalid cost amount');
                    });
                });

                context('when cost amount equals to public sale cost', () => {
                    it('should mint', async () => {
                        // when
                        await nftContract.methods.mint(2).send({ from: minter, value: 600000 });

                        // then
                        const balance = await nftContract.methods.balanceOf(minter).call();
                        assert.equal(balance, 2);
                    });
                });
            });
        });

        context('when total supply limit is being exceeded', () => {
            it('should revert', async () => {
                // given
                const contract = await deployContract(1);
                await contract.methods.togglePublicSale().send({ from: contractOwner });

                // when & then
                await truffleAssert.reverts(
                    contract.methods.mint(2).send({ from: minter, value: 600000 }),
                    'Out of total supply limit');
            });
        });

        context('when mint limit by wallet is being exceeded', () => {
            it('should revert', async () => {
                // given
                await nftContract.methods.togglePublicSale().send({ from: contractOwner });

                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.mint(11).send({ from: minter, value: 3300000 }),
                    'Out of max mint limit');
            });
        });

        context('when successful public sale mint', () => {
            it('should update number minted by public sale', async () => {
                // given
                await nftContract.methods.togglePublicSale().send({ from: contractOwner });

                // when
                await nftContract.methods.mint(2).send({ from: minter, value: 600000 });

                // then
                const numberMinted = await nftContract.methods.numberMinted(minter).call();
                assert.equal(numberMinted, 2);
            });
        });
    });

    context('setPhase', () => {
        context('when sender is not owner', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.setPhase(5).send({ from: minter }),
                    'Ownable: caller is not the owner');
            });
        });

        context('when phase is higher than total phase count', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.setPhase(5).send({ from: contractOwner }),
                    'Invalid phase');
            });
        });

        context('when phase is valid', () => {
            it('should update current phase', async () => {
                // when
                await nftContract.methods.setPhase(1).send({ from: contractOwner });

                // then
                const phase = await nftContract.methods.currentPhase.call();
                assert(phase, 1);
            });
        });
    });

    context('updateStakeLimitPerToken', () => {
        context('when sender is not owner', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.updateStakeLimitPerToken(5).send({ from: minter }),
                    'Ownable: caller is not the owner');
            });
        });

        context('when sender is owner', () => {
            it('should revert', async () => {
                // when
                await nftContract.methods.updateStakeLimitPerToken(3).send({ from: contractOwner });

                // then
                const stakeLimitPerWallet = await nftContract.methods.stakeLimitPerToken().call();
                assert.equal(stakeLimitPerWallet, 3);
            });
        });

    });

    context('addStakeOption', () => {
        context('when sender is not owner', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.addStakeOption(1000, 200, 1, true).send({ from: minter }),
                    'Ownable: caller is not the owner');
            });
        });

        context('when interval is invalid', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.addStakeOption(0, 200, 1, true).send({ from: contractOwner }),
                    'Invalid interval');
            });
        });

        context('when data is valid', () => {
            it('should update the stake option', async () => {
                // when
                await nftContract.methods.addStakeOption(111, 222, 333, true).send({ from: contractOwner });

                // then
                const stakeOption = await nftContract.methods.stakeOptions(2).call();
                assert.equal(stakeOption.interval, 111);
                assert.equal(stakeOption.reward, 222);
                assert.equal(stakeOption.intervalExtensionLimit, 333);
                assert.equal(stakeOption.enabled, true);
            });
        });
    });

    context('updateStakeOption', () => {
        context('when sender is not owner', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.updateStakeOption(5, 1000, 200, 1, true).send({ from: minter }),
                    'Ownable: caller is not the owner');
            });
        });

        context('when option is invalid', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.updateStakeOption(5, 1000, 200, 1, true).send({ from: contractOwner }),
                    'Invalid stake option');
            });
        });


        context('when interval is invalid', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.updateStakeOption(0, 0, 200, 1, true).send({ from: contractOwner }),
                    'Invalid interval');
            });
        });

        context('when data is valid', () => {
            it('should update the stake option', async () => {
                // when
                await nftContract.methods.updateStakeOption(0, 111, 222, 333, false).send({ from: contractOwner });

                // then
                const stakeOption = await nftContract.methods.stakeOptions(0).call();
                assert.equal(stakeOption.interval, 111);
                assert.equal(stakeOption.reward, 222);
                assert.equal(stakeOption.intervalExtensionLimit, 333);
                assert.equal(stakeOption.enabled, false);
            });
        });
    });

    context('toggleAllStakeOptions', () => {
        context('when sender is not owner', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.toggleAllStakeOptions(true).send({ from: minter }),
                    'Ownable: caller is not the owner');
            });
        });

        context('when sender is owner', () => {
            context('when flag is true', () => {
                it('should enable all stake options', async () => {
                    // when
                    await nftContract.methods.toggleAllStakeOptions(true).send({ from: contractOwner });

                    // then
                    const stakeOption1 = await nftContract.methods.stakeOptions(0).call();
                    assert.equal(stakeOption1.enabled, true);

                    const stakeOption2 = await nftContract.methods.stakeOptions(1).call();
                    assert.equal(stakeOption2.enabled, true);
                });
            });

            context('when flag is false', () => {
                it('should disable all stake options', async () => {
                    // when
                    await nftContract.methods.toggleAllStakeOptions(false).send({ from: contractOwner });

                    // then
                    const stakeOption1 = await nftContract.methods.stakeOptions(0).call();
                    assert.equal(stakeOption1.enabled, false);

                    const stakeOption2 = await nftContract.methods.stakeOptions(1).call();
                    assert.equal(stakeOption2.enabled, false);
                });
            });
        });
    });

    context('stake', () => {
        beforeEach(async () => {
            await nftContract.methods.togglePublicSale().send({ from: contractOwner });
            await nftContract.methods.mint(10).send({ from: minter, value: 3000000 });
        });

        context('when option is disabled', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.stake([123], 1).send({ from: minter }),
                    'Stake option is disabled');
            });
        });

        context('when option is invalid', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(nftContract.methods.stake([123], 5).send({ from: minter }));
            });
        });

        context('when caller is not token owner', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.stake([1, 2], 0).send({ from: contractOwner }),
                    'Invalid token owner');
            });
        });

        context('when caller is minter', () => {
            context('when token is already staked', () => {
                it('should revert', async () => {
                    // given
                    await nftContract.methods.stake([1], 0).send({ from: minter });

                    // when & then
                    await truffleAssert.reverts(
                        nftContract.methods.stake([1, 2], 0).send({ from: minter }),
                        'Token already staked');
                });
            });

            context('when exceeds stake limit per token', () => {
                it('should revert', async () => {
                    // given
                    await nftContract.methods.updateStakeLimitPerToken(0).send({ from: contractOwner });

                    // when & then                
                    await truffleAssert.reverts(
                        nftContract.methods.stake([1, 2], 0).send({ from: minter }),
                        'Out of stake limit per token');
                });
            });

            context('when everything is fine', () => {
                it('should stake', async () => {
                    // when
                    await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                    // then 
                    const blockTime = await getBlockTime();
                    const stake1 = await nftContract.methods.tokenStake(1).call();
                    assert.equal(stake1.option, 0);
                    assert.equal(stake1.startTime, blockTime);

                    const stake2 = await nftContract.methods.tokenStake(2).call();
                    assert.equal(stake2.option, 0);
                    assert.equal(stake2.startTime, blockTime);
                });
            });
        });
    });

    context('unstake', () => {
        beforeEach(async () => {
            await nftContract.methods.togglePublicSale().send({ from: contractOwner });
            await nftContract.methods.mint(10).send({ from: minter, value: 3000000 });
        });

        context('when token is not staked', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.unstake([1]).send({ from: minter }),
                    'Token is not staked');
            });
        });

        context('when token is staked', () => {
            context('when caller is not the minter', () => {
                it('should revert', async () => {
                    // given
                    await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                    // when & then
                    await truffleAssert.reverts(
                        nftContract.methods.unstake([1]).send({ from: contractOwner }),
                        'Only the owner can unstake it');
                });
            });

            context('when caller is minter', () => {
                context('when stake is not completed yet', () => {
                    it('should unstake without any reward', async () => {
                        // given       
                        const stakeResult = await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 100;
                        await advanceBlockAtTime(endTime);
                        const beforeBalance = await getBalance(minter);

                        // when
                        const result = await nftContract.methods.unstake([1]).send({ from: minter });

                        // then                    
                        assert.equal(result.events.Unstaked.returnValues.tokenId, 1);
                        assert.equal(result.events.Unstaked.returnValues.option, 0);
                        assert.equal(result.events.Unstaked.returnValues.reward, 0);
                        assert.equal(result.events.Unstaked.returnValues.rewardCount, 0);
                        assert.equal(result.events.Unstaked.returnValues.startTime, await getTxBlockTime(stakeResult));
                        assert.equal(result.events.Unstaked.returnValues.endTime, await getTxBlockTime(result));

                        const afterBalance = await getBalance(minter);
                        const gasCost = await getTxGasCost(result);
                        assert.equal(beforeBalance.toString(), afterBalance.add(gasCost).toString());
                    });
                });

                context('when stake is completed', () => {
                    it('should unstake with reward', async () => {
                        // given       
                        const stakeResult = await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 7500;
                        await advanceBlockAtTime(endTime);
                        const beforeBalance = await getBalance(minter);

                        // when
                        const result = await nftContract.methods.unstake([1]).send({ from: minter });

                        // then                    
                        assert.equal(result.events.Unstaked.returnValues.tokenId, 1);
                        assert.equal(result.events.Unstaked.returnValues.option, 0);
                        assert.equal(result.events.Unstaked.returnValues.reward, 1000);
                        assert.equal(result.events.Unstaked.returnValues.rewardCount, 1);
                        assert.equal(result.events.Unstaked.returnValues.totalTokenStakeCount, 1);
                        assert.equal(result.events.Unstaked.returnValues.startTime, await getTxBlockTime(stakeResult));
                        assert.equal(result.events.Unstaked.returnValues.endTime, await getTxBlockTime(result));

                        const afterBalance = await getBalance(minter);
                        const gasCost = await getTxGasCost(result);
                        assert.equal(afterBalance.toString(), beforeBalance.add(-gasCost).add(1000).toString());
                    });
                });

                context('when stake is completed', () => {
                    it('should unstake with reward', async () => {
                        // given       
                        const stakeResult = await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 7500;
                        await advanceBlockAtTime(endTime);
                        const beforeBalance = await getBalance(minter);

                        // when
                        const result = await nftContract.methods.unstake([1]).send({ from: minter });

                        // then                    
                        assert.equal(result.events.Unstaked.returnValues.tokenId, 1);
                        assert.equal(result.events.Unstaked.returnValues.option, 0);
                        assert.equal(result.events.Unstaked.returnValues.reward, 1000);
                        assert.equal(result.events.Unstaked.returnValues.rewardCount, 1);
                        assert.equal(result.events.Unstaked.returnValues.totalTokenStakeCount, 1);
                        assert.equal(result.events.Unstaked.returnValues.startTime, await getTxBlockTime(stakeResult));
                        assert.equal(result.events.Unstaked.returnValues.endTime, await getTxBlockTime(result));

                        const afterBalance = await getBalance(minter);
                        const gasCost = await getTxGasCost(result);
                        assert.equal(afterBalance.toString(), beforeBalance.add(-gasCost).add(1000).toString());
                    });
                });

                context('when stake is extended', () => {
                    it('should unstake with extended reward', async () => {
                        // given       
                        const stakeResult = await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 15100;
                        await advanceBlockAtTime(endTime);
                        const beforeBalance = await getBalance(minter);

                        // when
                        const result = await nftContract.methods.unstake([1]).send({ from: minter });

                        // then                    
                        assert.equal(result.events.Unstaked.returnValues.tokenId, 1);
                        assert.equal(result.events.Unstaked.returnValues.option, 0);
                        assert.equal(result.events.Unstaked.returnValues.reward, 3000);
                        assert.equal(result.events.Unstaked.returnValues.rewardCount, 3);
                        assert.equal(result.events.Unstaked.returnValues.totalTokenStakeCount, 3);
                        assert.equal(result.events.Unstaked.returnValues.startTime, await getTxBlockTime(stakeResult));
                        assert.equal(result.events.Unstaked.returnValues.endTime, await getTxBlockTime(result));

                        const afterBalance = await getBalance(minter);
                        const gasCost = await getTxGasCost(result);
                        assert.equal(afterBalance.toString(), beforeBalance.add(-gasCost).add(3000).toString());
                    });
                });

                context('when stake extension exceeds the interval limit', () => {
                    it('should unstake with maximum extended reward', async () => {
                        // given       
                        const stakeResult = await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 40000;
                        await advanceBlockAtTime(endTime);
                        const beforeBalance = await getBalance(minter);

                        // when
                        const result = await nftContract.methods.unstake([1]).send({ from: minter });

                        // then                    
                        assert.equal(result.events.Unstaked.returnValues.tokenId, 1);
                        assert.equal(result.events.Unstaked.returnValues.option, 0);
                        assert.equal(result.events.Unstaked.returnValues.reward, 6000);
                        assert.equal(result.events.Unstaked.returnValues.rewardCount, 6);
                        assert.equal(result.events.Unstaked.returnValues.totalTokenStakeCount, 6);
                        assert.equal(result.events.Unstaked.returnValues.startTime, await getTxBlockTime(stakeResult));
                        assert.equal(result.events.Unstaked.returnValues.endTime, await getTxBlockTime(result));

                        const afterBalance = await getBalance(minter);
                        const gasCost = await getTxGasCost(result);
                        assert.equal(afterBalance.toString(), beforeBalance.add(-gasCost).add(6000).toString());
                    });
                });

                context('when stake extension exceeds the stake per token limit', () => {
                    it('should unstake with extended reward', async () => {
                        // given       
                        await nftContract.methods.stake([1, 2], 0).send({ from: minter });
                        await advanceBlockAtTime((await getBlockTime()) + 11000);
                        await nftContract.methods.unstake([1]).send({ from: minter });

                        const stakeResult = await nftContract.methods.stake([1], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 40000;
                        await advanceBlockAtTime(endTime);
                        const beforeBalance = await getBalance(minter);

                        // when
                        const result = await nftContract.methods.unstake([1]).send({ from: minter });

                        // then                    
                        assert.equal(result.events.Unstaked.returnValues.tokenId, 1);
                        assert.equal(result.events.Unstaked.returnValues.option, 0);
                        assert.equal(result.events.Unstaked.returnValues.reward, 5000);
                        assert.equal(result.events.Unstaked.returnValues.rewardCount, 5);
                        assert.equal(result.events.Unstaked.returnValues.totalTokenStakeCount, 7);
                        assert.equal(result.events.Unstaked.returnValues.startTime, await getTxBlockTime(stakeResult));
                        assert.equal(result.events.Unstaked.returnValues.endTime, await getTxBlockTime(result));

                        const afterBalance = await getBalance(minter);
                        const gasCost = await getTxGasCost(result);
                        assert.equal(afterBalance.toString(), beforeBalance.add(-gasCost).add(5000).toString());
                    });
                });
            });

            context('when caller is owner but not minter', () => {
                context('when stake is completed', () => {
                    it('should unstake without reward', async () => {
                        // given
                        await nftContract.methods.transferFrom(minter, contractOwner, 1).send({ from: minter });
                        await nftContract.methods.transferFrom(minter, contractOwner, 2).send({ from: minter });
                        const stakeResult = await nftContract.methods.stake([1, 2], 0).send({ from: contractOwner });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 7500;
                        await advanceBlockAtTime(endTime);
                        const beforeBalance = await getBalance(contractOwner);

                        // when
                        const result = await nftContract.methods.unstake([1]).send({ from: contractOwner });

                        // then                    
                        assert.equal(result.events.Unstaked.returnValues.tokenId, 1);
                        assert.equal(result.events.Unstaked.returnValues.option, 0);
                        assert.equal(result.events.Unstaked.returnValues.reward, 0);
                        assert.equal(result.events.Unstaked.returnValues.rewardCount, 0);
                        assert.equal(result.events.Unstaked.returnValues.totalTokenStakeCount, 0);
                        assert.equal(result.events.Unstaked.returnValues.startTime, await getTxBlockTime(stakeResult));
                        assert.equal(result.events.Unstaked.returnValues.endTime, await getTxBlockTime(result));

                        const afterBalance = await getBalance(contractOwner);
                        const gasCost = await getTxGasCost(result);
                        assert.equal(afterBalance.toString(), beforeBalance.add(-gasCost).toString());
                    });
                });
            });
        });

        afterEach(async () => {
            await advanceBlockAtTime(now());
        });
    });

    context('calculateTokenStakeRewards', () => {
        beforeEach(async () => {
            await nftContract.methods.togglePublicSale().send({ from: contractOwner });
            await nftContract.methods.mint(10).send({ from: minter, value: 3000000 });
        });

        context('when token is not staked', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.calculateTokenStakeRewards([1]).call(),
                    'Token is not staked');
            });
        });

        context('when token is staked', () => {
            context('when caller is minter', () => {
                context('when stake is not completed yet', () => {
                    it('should return no reward', async () => {
                        // given
                        await nftContract.methods.stake([1, 2], 0).send({ from: minter });
                        const startTime = await getBlockTime();
                        const endTime = startTime + 100;
                        await advanceBlockAtTime(endTime);

                        // when
                        const result = await nftContract.methods.calculateTokenStakeRewards([1]).call();

                        // then
                        assert.equal(result.length, 1);
                        assert.equal(result[0].tokenId, 1);
                        assert.equal(result[0].reward, 0);
                        assert.equal(result[0].rewardCount, 0);
                    });
                });

                context('when stake is completed', () => {
                    it('should return reward', async () => {
                        // given
                        await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 7500;
                        await advanceBlockAtTime(endTime);

                        // when
                        const result = await nftContract.methods.calculateTokenStakeRewards([1]).call();

                        // then
                        assert.equal(result.length, 1);
                        assert.equal(result[0].tokenId, 1);
                        assert.equal(result[0].reward, 1000);
                        assert.equal(result[0].rewardCount, 1);
                    });
                });

                context('when stake is extended', () => {
                    it('should return extended reward', async () => {
                        // given
                        await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 15100;
                        await advanceBlockAtTime(endTime);

                        // when
                        const result = await nftContract.methods.calculateTokenStakeRewards([1]).call();

                        // then
                        assert.equal(result.length, 1);
                        assert.equal(result[0].tokenId, 1);
                        assert.equal(result[0].reward, 3000);
                        assert.equal(result[0].rewardCount, 3);
                    });
                });

                context('when stake extension exceeds the interval limit', () => {
                    it('should return maximum extended reward', async () => {
                        // given
                        await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 40000;
                        await advanceBlockAtTime(endTime);

                        // when
                        const result = await nftContract.methods.calculateTokenStakeRewards([1]).call();

                        // then
                        assert.equal(result.length, 1);
                        assert.equal(result[0].tokenId, 1);
                        assert.equal(result[0].reward, 6000);
                        assert.equal(result[0].rewardCount, 6);
                    });
                });

                context('when stake extension exceeds the stake per token limit', () => {
                    it('should return extended reward', async () => {
                        // given
                        await nftContract.methods.stake([1, 2], 0).send({ from: minter });
                        await advanceBlockAtTime((await getBlockTime()) + 11000);
                        await nftContract.methods.unstake([1]).send({ from: minter });

                        await nftContract.methods.stake([1], 0).send({ from: minter });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 40000;
                        await advanceBlockAtTime(endTime);

                        // when
                        const result = await nftContract.methods.calculateTokenStakeRewards([1]).call();

                        // then
                        assert.equal(result.length, 1);
                        assert.equal(result[0].tokenId, 1);
                        assert.equal(result[0].reward, 5000);
                        assert.equal(result[0].rewardCount, 5);
                    });
                });
            });

            context('when owner is not minter', () => {
                context('when stake is completed', () => {
                    it('should return no reward', async () => {
                        // given
                        await nftContract.methods.transferFrom(minter, contractOwner, 1).send({ from: minter });
                        await nftContract.methods.transferFrom(minter, contractOwner, 2).send({ from: minter });
                        await nftContract.methods.stake([1, 2], 0).send({ from: contractOwner });

                        const startTime = await getBlockTime();
                        const endTime = startTime + 7500;
                        await advanceBlockAtTime(endTime);

                        // when
                        const result = await nftContract.methods.calculateTokenStakeRewards([1]).call();

                        // then
                        assert.equal(result.length, 1);
                        assert.equal(result[0].tokenId, 1);
                        assert.equal(result[0].reward, 0);
                        assert.equal(result[0].rewardCount, 0);
                    });
                });
            });
        });

        afterEach(async () => {
            await advanceBlockAtTime(now());
        });
    });

    context('transferFrom', () => {
        beforeEach(async () => {
            await nftContract.methods.togglePublicSale().send({ from: contractOwner });
            await nftContract.methods.mint(10).send({ from: minter, value: 3000000 });
        });

        context('when token is staked', () => {
            it('should revert', async () => {
                // given
                await nftContract.methods.stake([1, 2], 0).send({ from: minter });

                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.transferFrom(minter, contractOwner, 1).send({ from: minter }),
                    'Token is staked');
            });
        });

        context('when token is not staked', () => {
            it('should transfer', async () => {
                // when 
                await nftContract.methods.transferFrom(minter, contractOwner, 1).send({ from: minter });

                // then
                const owner = await nftContract.methods.ownerOf(1).call();
                assert.equal(owner, contractOwner);
            });
        });
    });

    context('receive', () => {
        it('should retrieve sent balance', async () => {
            // given
            const beforeBalance = await getBalance(nftContract._address);
            const minterSigner = web3Provider.getSigner(minter);

            // when
            await minterSigner.sendTransaction({
                to: nftContract._address,
                value: 20000000,
            });

            // then
            const afterBalance = await getBalance(nftContract._address);
            assert.equal(afterBalance.toString(), beforeBalance.add(20000000).toString());
        });
    });

    context('withdraw', () => {
        const requester = 'user-id';
        context('when balance is zero', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.withdraw([], requester).send({ from: contractOwner }),
                    'Not enough balance');
            });
        });

        context('when total percentage is not equal to 100', () => {
            it('should revert', async () => {
                // given
                const signature = await signWhitelisted(minter, 0);
                await nftContract.methods.privateMint(2, signature).send({ from: minter, value: 20000000 });

                const withdraws = [{
                    walletAddress: withdrawWallet1,
                    percentage: 50
                },
                {
                    walletAddress: withdrawWallet2,
                    percentage: 30
                }];

                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.withdraw(withdraws, requester).send({ from: contractOwner }),
                    'Invalid total percentage');
            });
        });

        context('when total percantage is equal to 100', () => {
            it('should withdraw', async () => {
                // given
                const signature = await signWhitelisted(minter, 0);
                await nftContract.methods.privateMint(2, signature).send({ from: minter, value: 20000000 });

                const previousBalance1 = ethers.BigNumber.from(await web3.eth.getBalance(withdrawWallet1));
                const previousBalance2 = ethers.BigNumber.from(await web3.eth.getBalance(withdrawWallet2));
                const withdraws = [{
                    walletAddress: withdrawWallet1,
                    percentage: 60
                },
                {
                    walletAddress: withdrawWallet2,
                    percentage: 40
                }];

                // when
                const result = await nftContract.methods.withdraw(withdraws, requester).send({ from: contractOwner });

                // then
                const afterBalance1 = ethers.BigNumber.from(await web3.eth.getBalance(withdrawWallet1));
                const afterBalance2 = ethers.BigNumber.from(await web3.eth.getBalance(withdrawWallet2));
                const contractBalance = ethers.BigNumber.from(await web3.eth.getBalance(nftContract._address));

                assert.equal(afterBalance1.toString(), previousBalance1.add(12000000).toString());
                assert.equal(afterBalance2.toString(), previousBalance2.add(8000000).toString());
                assert.equal(contractBalance.toString(), '0');
                assert.equal(result.events.Withdrawn.returnValues.requester, requester);
            });
        });
    });

    context('tokenURI', () => {
        context('when token is not minted', () => {
            it('should revert', async () => {
                // when & then
                await truffleAssert.reverts(
                    nftContract.methods.tokenURI(100).call(),
                    'revert');
            });
        });

        context('when token is minted', () => {
            it('should return tokenURI', async () => {
                // given
                const signature = await signWhitelisted(minter, 0);
                await nftContract.methods.privateMint(2, signature).send({ from: minter, value: 20000000 });

                // when
                const tokenURI = await nftContract.methods.tokenURI(1).call();

                // then
                assert.equal(tokenURI, `https://api.test.com/collection-launches/${nftContract._address.toLowerCase()}/tokens/1/metadata?network=Ethereum`);
            });
        });
    });

    context('verifySignature', () => {
        context('when signature is valid', () => {
            it('should return true', async () => {
                // given
                const signature = await signWhitelisted(minter, 0);

                // when
                const result = await nftContract.methods.verifySignature(minter, 0, signature).call();

                // then
                assert.equal(result, true);
            });

        });
    });

    context('publicSaleCost', () => {
        it('should set public sale cost', async () => {
            // when
            await nftContract.methods.setPublicSaleCost(50001).send({ from: contractOwner });

            // when & then
            const cost = await nftContract.methods.publicSaleCost().call()
            assert.equal(cost, 50001);
        });
    });

    context('mintLimitByWallet', () => {
        context('when mint limit by wallet is valid', () => {
            it('should set mint limit by wallet', async () => {
                // when
                await nftContract.methods.setMintLimitByWallet([1,1], 1).send({ from: contractOwner });
    
                // when & then
                const publicSaleMintLimitByWallet = await nftContract.methods.publicSaleMintLimitByWallet().call();
                const phaseMintLimitByWalletFirstItem = await nftContract.methods.phaseMintLimitByWallet(0).call();
                const phaseMintLimitByWalletSecondItem = await nftContract.methods.phaseMintLimitByWallet(0).call();
                assert.equal(publicSaleMintLimitByWallet, 1);
                assert.equal(phaseMintLimitByWalletFirstItem, 1);
                assert.equal(phaseMintLimitByWalletSecondItem, 1);
            });
        });

        context('when mint limit by wallet is not valid', () => {
            if('should revert', async () => {
             //when & then
            await truffleAssert.reverts(
                await nftContract.methods.setMintLimitByWallet([1,1,1], 1).send({ from: contractOwner }),
                'Invalid mint limit length');
            });
        });
    });
});

async function deployContract(totalSupplyLimit = 100) {
    const nftABI = nftJson['abi'];
    const nftByteCode = nftJson['bytecode'];

    const deployedContract = await new web3.eth.Contract(nftABI)
        .deploy({ data: nftByteCode, arguments: ['Collection Launch NFTs', 'CLNF', [10, 15], 10, totalSupplyLimit, 0, [10000000, 20000000], 300000, operator, 'https://api.test.com', 'Ethereum', false, 7, [{ interval: 5000, reward: 1000, intervalExtensionLimit: 5, enabled: true }, { interval: 5000, reward: 1000, intervalExtensionLimit: 1, enabled: false }]] })
        .send({ from: contractOwner, gas: '5000000' });

    return deployedContract;
}

async function signWhitelisted(address, phase, contractAddress = null) {
    contractAddress = contractAddress ?? nftContract._address;
    const message = ethers.utils.solidityPack(
        ["address", "address", "uint8"],
        [contractAddress, address, phase]
    );
    const hashedMessage = ethers.utils.solidityKeccak256(["bytes"], [message]);
    const finalMessage = ethers.utils.arrayify(hashedMessage);
    const signatureData = await operatorSigner.signMessage(finalMessage);
    return signatureData;
}

async function getBlockTime(b = 'latest') {
    const block = await web3.eth.getBlock(b);
    return block.timestamp;
}

function advanceBlockAtTime(time) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: "2.0",
                method: "evm_mine",
                params: [time],
                id: new Date().getTime(),
            },
            (err, _) => {
                if (err) {
                    return reject(err);
                }
                const newBlockHash = web3.eth.getBlock("latest").hash;

                return resolve(newBlockHash);
            },
        );
    });
};

function now() {
    return Math.round(Date.now() / 1000);
}

async function getBalance(address) {
    return ethers.BigNumber.from(await web3.eth.getBalance(address))
}

async function getTxBlockTime(result) {
    const tx = await web3.eth.getTransaction(result.transactionHash);
    return getBlockTime(tx.blockNumber);
}

async function getTxGasCost(result) {
    const tx = await web3.eth.getTransaction(result.transactionHash);
    return parseInt(result.gasUsed) * parseInt(tx.gasPrice);
}