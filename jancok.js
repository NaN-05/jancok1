require('dotenv').config();
const { ethers } = require('ethers');

// Kode Warna ANSI
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

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
const MONITORING_INTERVAL = parseInt(process.env.MONITORING_INTERVAL, 10) || 60000; // Default 60 detik
const MAX_RETRY = 3; // Jumlah maksimum retry untuk error sementara

// Validasi input dari environment variables
const validateEnvVariables = () => {
  const requiredEnvVars = [
    'DEPOSIT_WALLET_PRIVATE_KEY',
    'VAULT_WALLET_ADDRESS',
    'ETHEREUM_RPC_URL',
    'ETHEREUM_CHAIN_ID',
    'BSC_RPC_URL',
    'BSC_CHAIN_ID',
    'ARBITRUM_RPC_URL',
    'ARBITRUM_CHAIN_ID',
    'BASE_RPC_URL',
    'BASE_CHAIN_ID',
  ];

  requiredEnvVars.forEach((key) => {
    if (!process.env[key]) {
      console.error(`${RED}❌ Missing environment variable: ${key}${RESET}`);
      process.exit(1); // Keluar jika ada variable yang hilang
    }
  });

  if (!ethers.isAddress(process.env.VAULT_WALLET_ADDRESS)) {
    console.error(`${RED}❌ Invalid VAULT_WALLET_ADDRESS: ${process.env.VAULT_WALLET_ADDRESS}${RESET}`);
    process.exit(1);
  }

  if (!ethers.isAddress(new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY).address)) {
    console.error(`${RED}❌ Invalid DEPOSIT_WALLET_PRIVATE_KEY.${RESET}`);
    process.exit(1);
  }
};

// Fungsi untuk menangani retry
const withRetry = async (fn, retries = MAX_RETRY) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.error(`${YELLOW}⚠️ Attempt ${attempt} failed: ${err.message}${RESET}`);
      if (attempt === retries) {
        throw new Error(`${RED}❌ Failed after ${retries} attempts: ${err.message}${RESET}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Tunggu 2 detik sebelum retry
    }
  }
};

// Fungsi untuk memproses transfer di jaringan tertentu
const processNetworkTransfer = async (networkName) => {
  const networkConfig = getNetworkConfig(networkName);
  if (!networkConfig || !networkConfig.rpcUrl || !networkConfig.chainId) {
    console.error(`${RED}❌ Invalid network configuration for: ${networkName}${RESET}`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const depositWallet = new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY, provider);
  const depositWalletAddress = await depositWallet.getAddress();

  try {
    const balance = await provider.getBalance(depositWalletAddress);
    const formattedBalance = ethers.formatEther(balance);

    console.log(`${CYAN}[${networkName.toUpperCase()}] 💰 Current balance: ${GREEN}${formattedBalance} ETH${RESET}`);

    if (balance >= MIN_TRANSFER_AMOUNT) {
      console.log(`${CYAN}[${networkName.toUpperCase()}] ⚡ Balance meets the minimum transfer requirement.${RESET}`);
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

        console.log(`${CYAN}[${networkName.toUpperCase()}] 🚀 Sending transaction...${RESET}`);
        const txResponse = await withRetry(() => depositWallet.sendTransaction(txDetails));
        const receipt = await withRetry(() => txResponse.wait());

        console.log(`${GREEN}[${networkName.toUpperCase()}] ✅ Transaction confirmed in block ${receipt.blockNumber}${RESET}`);
        console.log(`${CYAN}[${networkName.toUpperCase()}] 💸 Transferred to ${process.env.VAULT_WALLET_ADDRESS}${RESET}`);
      } else {
        console.log(`${YELLOW}[${networkName.toUpperCase()}] ⚠️ Insufficient balance to cover gas fees.${RESET}`);
      }
    } else {
      console.log(`${YELLOW}[${networkName.toUpperCase()}] ⚠️ Balance is below the minimum transfer amount.${RESET}`);
    }
  } catch (err) {
    console.error(`${RED}[${networkName.toUpperCase()}] ❌ Error: ${err.message}${RESET}`);
  }
};

// Fungsi utama untuk iterasi melalui semua jaringan
const main = async () => {
  validateEnvVariables();

  const networks = ['ethereum', 'bsc', 'arbitrum', 'base'];
  for (const network of networks) {
    console.log(`${GREEN}🌐 Monitoring Network: ${network.toUpperCase()}${RESET}`);
    await processNetworkTransfer(network);
  }

  console.log(`${CYAN}\n🕒 Monitoring interval: ${MONITORING_INTERVAL / 1000} seconds.\n${RESET}`);
};

// Jalankan fungsi monitoring dengan interval yang diatur
if (require.main === module) {
  setInterval(() => {
    main().catch((err) => {
      console.error(`${RED}❌ Error in main function: ${err.message}${RESET}`);
    });
  }, MONITORING_INTERVAL);
}
