require('dotenv').config();
const { ethers } = require('ethers');

// Konfigurasi jaringan
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

// Validasi konfigurasi environment
const validateEnvVariables = () => {
  const requiredVars = ['VAULT_WALLET_ADDRESS', 'DEPOSIT_WALLET_PRIVATE_KEY', 'MONITORING_INTERVAL'];
  requiredVars.forEach((key) => {
    if (!process.env[key]) {
      console.error(`❌ Missing environment variable: ${key}`);
      process.exit(1);
    }
  });

  if (!ethers.isAddress(process.env.VAULT_WALLET_ADDRESS)) {
    console.error(`❌ Invalid VAULT_WALLET_ADDRESS.`);
    process.exit(1);
  }
};

// Fungsi dengan mekanisme retry
const withRetry = async (fn, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.error(`⚠️ Attempt ${attempt} failed: ${err.message}`);
      if (attempt === retries) {
        throw new Error(`❌ Retry failed after ${retries} attempts: ${err.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Delay sebelum retry
    }
  }
};

// Proses transfer
const processNetworkTransfer = async (networkName) => {
  const networkConfig = getNetworkConfig(networkName);
  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const depositWallet = new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY, provider);
  const depositAddress = await depositWallet.getAddress();

  try {
    const balance = await provider.getBalance(depositAddress);
    const formattedBalance = ethers.formatEther(balance);
    console.log(`[${networkName.toUpperCase()}] 💰 Balance: ${formattedBalance} ETH`);

    if (balance >= ethers.parseEther(process.env.MIN_TRANSFER_AMOUNT || '0.001')) {
      const feeData = await provider.getFeeData();
      const gasLimit = await provider.estimateGas({
        to: process.env.VAULT_WALLET_ADDRESS,
        value: balance,
      });

      const maxGasFee = feeData.gasPrice * gasLimit;
      if (balance > maxGasFee) {
        const txDetails = {
          to: process.env.VAULT_WALLET_ADDRESS,
          value: balance - maxGasFee,
          gasLimit,
          gasPrice: feeData.gasPrice,
        };

        console.log(`[${networkName.toUpperCase()}] 🚀 Preparing to send transaction...`);
        if (process.env.DRY_RUN === 'true') {
          console.log(`[${networkName.toUpperCase()}] 🧪 Dry run mode enabled. Transaction not sent.`);
        } else {
          const txResponse = await withRetry(() => depositWallet.sendTransaction(txDetails));
          const receipt = await withRetry(() => txResponse.wait());
          console.log(`[${networkName.toUpperCase()}] ✅ Transaction confirmed in block ${receipt.blockNumber}`);
        }
      } else {
        console.error(`[${networkName.toUpperCase()}] ⚠️ Insufficient balance for gas fees.`);
      }
    } else {
      console.error(`[${networkName.toUpperCase()}] ⚠️ Balance below minimum transfer amount.`);
    }
  } catch (err) {
    console.error(`[${networkName.toUpperCase()}] ❌ Error: ${err.message}`);
  }
};

// Fungsi utama
const main = async () => {
  validateEnvVariables();
  const networks = ['ethereum', 'bsc', 'arbitrum', 'base'];
  console.log(`🔄 Starting monitoring across networks...`);

  await Promise.all(networks.map((network) => processNetworkTransfer(network)));
};

// Jalankan monitoring dengan interval
if (require.main === module) {
  const interval = parseInt(process.env.MONITORING_INTERVAL, 10) || 60000; // Default 60 detik
  setInterval(async () => {
    try {
      await main();
    } catch (err) {
      console.error(`❌ Error in main loop: ${err.message}`);
    }
  }, interval);
}
