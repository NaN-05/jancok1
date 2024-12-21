require('dotenv').config();
const { ethers } = require('ethers');

// Fungsi untuk memilih konfigurasi jaringan
const getNetworkConfig = (networkName) => {
  const networks = {
    ethereum: {
      rpcUrl: process.env.ETHEREUM_RPC_URL,
      chainId: parseInt(process.env.ETHEREUM_CHAIN_ID, 10),
    },
    bsc: {
      rpcUrl: process.env.BSC_RPC_URL,
      chainId: parseInt(process.env.BSC_CHAIN_ID, 10),
    },
    polygon: {
      rpcUrl: process.env.POLYGON_RPC_URL,
      chainId: parseInt(process.env.POLYGON_CHAIN_ID, 10),
    },
    avalanche: {
      rpcUrl: process.env.AVALANCHE_RPC_URL,
      chainId: parseInt(process.env.AVALANCHE_CHAIN_ID, 10),
    },
    arbitrum: {
      rpcUrl: process.env.ARBITRUM_RPC_URL,
      chainId: parseInt(process.env.ARBITRUM_CHAIN_ID, 10),
    },
    base: {
      rpcUrl: process.env.BASE_RPC_URL,
      chainId: parseInt(process.env.BASE_CHAIN_ID, 10),
    },
  };

  return networks[networkName];
};

const MIN_TRANSFER_AMOUNT = ethers.parseEther(process.env.MIN_TRANSFER_AMOUNT || '0.001'); // Default 0.001 ETH
const MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL || '60000', 10); // Default 60 seconds

// Fungsi untuk memproses transfer di jaringan tertentu
const processNetworkTransfer = async (networkName) => {
  const networkConfig = getNetworkConfig(networkName);
  if (!networkConfig || !networkConfig.rpcUrl || !networkConfig.chainId) {
    console.error(`❌ Invalid network configuration for: ${networkName}`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const depositWallet = new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY, provider);
  const depositWalletAddress = await depositWallet.getAddress();

  try {
    const balance = await provider.getBalance(depositWalletAddress);
    console.log(`[${networkName}] 💰 Current balance: ${ethers.formatEther(balance)} ETH`);

    if (balance >= MIN_TRANSFER_AMOUNT) {
      console.log(`[${networkName}] ⚡ Balance meets the minimum transfer requirement.`);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
      const gasLimit = 21000;
      const maxGasFee = gasPrice * BigInt(gasLimit);

      if (balance > maxGasFee) {
        const txDetails = {
          to: process.env.VAULT_WALLET_ADDRESS,
          value: balance - maxGasFee,
          gasLimit,
          gasPrice,
        };

        console.log(`[${networkName}] 🚀 Sending transaction...`);
        const txResponse = await depositWallet.sendTransaction(txDetails);
        console.log(`[${networkName}] 🔗 Transaction sent: ${txResponse.hash}`);

        const receipt = await txResponse.wait();
        console.log(`[${networkName}] ✅ Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`[${networkName}] 💸 Transferred to ${process.env.VAULT_WALLET_ADDRESS}`);
      } else {
        console.log(`[${networkName}] ⚠️ Insufficient balance to cover gas fees.`);
      }
    } else {
      console.log(`[${networkName}] ⚠️ Balance is below the minimum transfer amount (${ethers.formatEther(MIN_TRANSFER_AMOUNT)} ETH).`);
    }
  } catch (err) {
    console.error(`[${networkName}] ❌ Error checking balance or sending transaction:`, err);
  }
};

// Fungsi untuk memantau jaringan secara periodik
const monitorNetworks = async () => {
  const networks = ['ethereum', 'bsc', 'polygon', 'avalanche', 'arbitrum', 'base'];
  console.log('🔄 Starting monitoring and auto-transfer process...');

  setInterval(async () => {
    console.log('🔍 Checking balances across all networks...');
    for (const networkName of networks) {
      console.log(`🌐 Monitoring network: ${networkName}`);
      await processNetworkTransfer(networkName);
    }
  }, MONITOR_INTERVAL);
};

// Mulai proses jika file dijalankan langsung
if (require.main === module) {
  monitorNetworks().catch((err) => {
    console.error('❌ Error in monitorNetworks function:', err);
  });
}
