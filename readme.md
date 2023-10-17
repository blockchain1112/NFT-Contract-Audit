To compile:
- truffle compile --all

To test:
- truffle test

To compile go files:
rm -rf build & solc --optimize --base-path '/' --via-ir --include-path 'node_modules/' --abi contracts/NFT.sol -o build
solc --optimize --via-ir --base-path '/' --include-path 'node_modules/' --bin contracts/NFT.sol -o build
abigen --abi=./build/NFT.abi --bin=./build/NFT.bin --pkg=api --out=./go-out/NFT.go