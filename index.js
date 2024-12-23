require('dotenv').config();
const { ethers } = require('ethers');
const debug = require('debug')('monitor');

// Validasi variabel lingkungan
const requiredEnvVars = [
  'ETHEREUM_WSS_URL',
  'ETHEREUM_CHAIN_ID',
  'BSC_WSS_URL',
  'BSC_CHAIN_ID',
  'ARBITRUM_WSS_URL',
  'ARBITRUM_CHAIN_ID',
  'BASE_WSS_URL',
  'BASE_CHAIN_ID',
  'DEPOSIT_WALLET_PRIVATE_KEY',
  'VAULT_WALLET_ADDRESS',
  'MIN_TRANSFER_AMOUNT',
  'MONITORING_INTERVAL',
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`❌ Environment variable ${varName} is missing.`);
    process.exit(1);
  }
}

// Fungsi untuk memilih konfigurasi jaringan
const getNetworkConfig = (networkName) => {
  const networks = {
    ethereum: {
      wssUrl: process.env.ETHEREUM_WSS_URL,
      chainId: parseInt(process.env.ETHEREUM_CHAIN_ID, 10),
    },
    bsc: {
      wssUrl: process.env.BSC_WSS_URL,
      chainId: parseInt(process.env.BSC_CHAIN_ID, 10),
    },
    arbitrum: {
      wssUrl: process.env.ARBITRUM_WSS_URL,
      chainId: parseInt(process.env.ARBITRUM_CHAIN_ID, 10),
    },
    base: {
      wssUrl: process.env.BASE_WSS_URL,
      chainId: parseInt(process.env.BASE_CHAIN_ID, 10),
    },
  };

  return networks[networkName];
};

const MIN_TRANSFER_AMOUNT = ethers.parseEther(process.env.MIN_TRANSFER_AMOUNT || '0.001'); // Default 0.001 ETH
const MONITORING_INTERVAL = parseInt(process.env.MONITORING_INTERVAL, 10) || 60000; // Default 60 detik
let isMonitoring = false; // Untuk mencegah overlap

// Fungsi untuk mencetak log ke bawah
const logToConsole = (message) => {
  console.log(`\x1b[32m${message}\x1b[0m`); // Teks hijau
};

// Fungsi untuk memproses transfer di jaringan tertentu menggunakan WSS
const processNetworkTransfer = async (networkName) => {
  const networkConfig = getNetworkConfig(networkName);
  if (!networkConfig || !networkConfig.wssUrl || !networkConfig.chainId) {
    logToConsole(`❌ Invalid network configuration for: ${networkName}`);
    return;
  }

  const provider = new ethers.WebSocketProvider(networkConfig.wssUrl);
  const depositWallet = new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY, provider);
  const depositWalletAddress = await depositWallet.getAddress();

  try {
    const balance = await provider.getBalance(depositWalletAddress);
    const formattedBalance = ethers.formatEther(balance);

    logToConsole(`[${networkName}] 💰 Current balance: ${formattedBalance} ETH`);

    if (balance >= MIN_TRANSFER_AMOUNT) {
      logToConsole(`[${networkName}] ⚡ Balance meets the minimum transfer requirement.`);
      const feeData = await provider.getFeeData();
      const gasPrice = (feeData.gasPrice || feeData.maxFeePerGas) * BigInt(12) / BigInt(10); // Tambahkan buffer 20%

      const gasLimit = await provider.estimateGas({
        to: process.env.VAULT_WALLET_ADDRESS,
        value: balance - gasPrice * BigInt(21000),
      });

      const maxGasFee = gasPrice * gasLimit;

      if (balance > maxGasFee) {
        const txDetails = {
          to: process.env.VAULT_WALLET_ADDRESS,
          value: balance - maxGasFee,
          gasLimit,
          gasPrice,
        };

        const txResponse = await depositWallet.sendTransaction(txDetails);
        const receipt = await txResponse.wait();

        logToConsole(
          `[${networkName}] ✅ Transaction confirmed in block ${receipt.blockNumber}. Transferred to ${process.env.VAULT_WALLET_ADDRESS}`
        );
      } else {
        logToConsole(`[${networkName}] ⚠️ Insufficient balance to cover gas fees.`);
      }
    } else {
      logToConsole(`[${networkName}] ⚠️ Balance is below the minimum transfer amount.`);
    }
  } catch (err) {
    logToConsole(`[${networkName}] ❌ Error: ${err.message}`);
  } finally {
    try {
      provider.destroy(); // Tutup koneksi WebSocket setelah selesai
    } catch (err) {
      logToConsole(`[${networkName}] ❌ Error closing WebSocket: ${err.message}`);
    }
  }
};

// Fungsi utama untuk iterasi melalui semua jaringan
const main = async () => {
  if (isMonitoring) {
    debug('🔄 Monitoring already in progress. Skipping this interval.');
    return;
  }

  isMonitoring = true;

  const networks = ['ethereum', 'bsc', 'arbitrum', 'base'];
  console.clear();

  logToConsole(`🔄 Starting monitoring for networks: ${networks.join(', ').toUpperCase()}`);
  
  try {
    await Promise.all(
      networks.map(async (network) => {
        await processNetworkTransfer(network);
      })
    );
  } catch (err) {
    console.error(`❌ Error in main function: ${err.message}`);
  } finally {
    logToConsole(`\n✅ Monitoring completed. Interval set to ${MONITORING_INTERVAL / 1000} seconds.\n`);
    isMonitoring = false;
  }
};

// Jalankan fungsi monitoring dengan interval yang diatur
if (require.main === module) {
  process.on('uncaughtException', (err) => {
    console.error(`❌ Uncaught Exception: ${err.message}`);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`);
  });

  setInterval(() => {
    main().catch((err) => {
      console.error(`❌ Error in main function: ${err.message}`);
    });
  }, MONITORING_INTERVAL);
}
