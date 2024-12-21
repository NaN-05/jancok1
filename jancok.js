require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios'); // Untuk mengirim notifikasi Telegram

// Konfigurasi warna terminal
const green = (text) => `\x1b[32m${text}\x1b[0m`; // Warna hijau
const red = (text) => `\x1b[31m${text}\x1b[0m`;   // Warna merah
const bold = (text) => `\x1b[1m${text}\x1b[0m`;   // Bold

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
      console.error(red(`❌ Missing environment variable: ${key}`));
      process.exit(1); // Keluar jika ada variable yang hilang
    }
  });

  if (!ethers.isAddress(process.env.VAULT_WALLET_ADDRESS)) {
    console.error(red(`❌ Invalid VAULT_WALLET_ADDRESS: ${process.env.VAULT_WALLET_ADDRESS}`));
    process.exit(1);
  }

  if (!ethers.isAddress(new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY).address)) {
    console.error(red(`❌ Invalid DEPOSIT_WALLET_PRIVATE_KEY.`));
    process.exit(1);
  }

  // Opsional: Periksa Telegram bot token dan chat ID
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.warn(red(`⚠️ Telegram notification is disabled. Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.`));
  }
};

// Fungsi untuk mengirim notifikasi Telegram
const sendTelegramNotification = async (message) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Jika botToken atau chatId tidak diatur, notifikasi tidak akan dikirim
  if (!botToken || !chatId) {
    console.log(green(`[NOTIFICATION] Telegram notification skipped: Missing credentials.`));
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: message,
    });
    console.log(green(`[NOTIFICATION] Telegram message sent: ${message}`));
  } catch (err) {
    console.error(red(`[NOTIFICATION] Failed to send Telegram message: ${err.message}`));
  }
};

// Fungsi untuk memproses transfer di jaringan tertentu
const processNetworkTransfer = async (networkName) => {
  const networkConfig = getNetworkConfig(networkName);
  if (!networkConfig || !networkConfig.rpcUrl || !networkConfig.chainId) {
    console.error(red(`❌ Invalid network configuration for: ${networkName}`));
    return;
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const depositWallet = new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY, provider);
  const depositWalletAddress = await depositWallet.getAddress();

  try {
    const balance = await provider.getBalance(depositWalletAddress);
    const formattedBalance = ethers.formatEther(balance);

    console.log(green(`[${networkName.toUpperCase()}] 💰 Current balance: ${formattedBalance} ETH`));

    if (balance >= MIN_TRANSFER_AMOUNT) {
      console.log(green(`[${networkName.toUpperCase()}] ⚡ Balance meets the minimum transfer requirement.`));
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

        console.log(bold(green(`[${networkName.toUpperCase()}] 🚀 Sending transaction...`)));
        const txResponse = await depositWallet.sendTransaction(txDetails);
        const receipt = await txResponse.wait();

        console.log(green(`[${networkName.toUpperCase()}] ✅ Transaction confirmed in block ${receipt.blockNumber}`));
        console.log(green(`[${networkName.toUpperCase()}] 💸 Transferred to ${process.env.VAULT_WALLET_ADDRESS}`));

        // Kirim notifikasi
        await sendTelegramNotification(
          `✅ [${networkName.toUpperCase()}]\nTransaction confirmed!\nBlock: ${receipt.blockNumber}\nAmount: ${formattedBalance} ETH`
        );
      } else {
        console.log(red(`[${networkName.toUpperCase()}] ⚠️ Insufficient balance to cover gas fees.`));
      }
    } else {
      console.log(red(`[${networkName.toUpperCase()}] ⚠️ Balance is below the minimum transfer amount.`));
    }
  } catch (err) {
    console.error(red(`[${networkName.toUpperCase()}] ❌ Error: ${err.message}`));
  }
};

// Fungsi utama untuk iterasi melalui semua jaringan
const main = async () => {
  validateEnvVariables();

  const networks = ['ethereum', 'bsc', 'arbitrum', 'base'];
  for (const network of networks) {
    console.log(bold(green(`🌐 Monitoring Network: ${network.toUpperCase()}`)));
    await processNetworkTransfer(network);
  }

  console.log(green(`\n🕒 Monitoring interval: ${MONITORING_INTERVAL / 1000} seconds.\n`));
};

// Jalankan fungsi monitoring dengan interval yang diatur
if (require.main === module) {
  setInterval(() => {
    console.clear(); // Bersihkan layar untuk efek dinamis
    console.log(bold(green(`HACKER TERMINAL - AUTO TRANSFER`)));
    console.log(bold(green(`==============================`)));
    main().catch((err) => {
      console.error(red(`❌ Error in main function: ${err.message}`));
    });
  }, MONITORING_INTERVAL);
}
