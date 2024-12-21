require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');

// Fungsi untuk mengirim notifikasi Telegram
const sendTelegramNotification = async (message) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('❌ Telegram bot token or chat ID not configured.');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const data = { chat_id: chatId, text: message };
    await axios.post(url, data);
    console.log('✅ Telegram notification sent.');
  } catch (err) {
    console.error('❌ Failed to send Telegram notification:', err.message);
  }
};

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

// Fungsi utama untuk memonitor dan memproses saldo
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
    const formattedBalance = ethers.formatEther(balance);

    console.log(`[${networkName}] 💰 Current balance: ${formattedBalance} ETH`);

    // Kirim notifikasi jika ada saldo masuk
    if (balance > 0) {
      const message = `[${networkName.toUpperCase()}] 📥 Deposit detected!\n💰 Balance: ${formattedBalance} ETH\nWallet: ${depositWalletAddress}`;
      await sendTelegramNotification(message);
    }

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
        const receipt = await txResponse.wait();

        console.log(`[${networkName}] ✅ Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`[${networkName}] 💸 Transferred to ${process.env.VAULT_WALLET_ADDRESS}`);

        const transferMessage = `[${networkName.toUpperCase()}] ✅ Transfer completed!\n💸 Transferred: ${ethers.formatEther(balance - maxGasFee)} ETH\nTo: ${process.env.VAULT_WALLET_ADDRESS}\nBlock: ${receipt.blockNumber}`;
        await sendTelegramNotification(transferMessage);
      } else {
        console.log(`[${networkName}] ⚠️ Insufficient balance to cover gas fees.`);
      }
    } else {
      console.log(`[${networkName}] ⚠️ Balance is below the minimum transfer amount.`);
    }
  } catch (err) {
    console.error(`[${networkName}] ❌ Error: ${err.message}`);
  }
};

// Fungsi utama untuk iterasi melalui semua jaringan
const main = async () => {
  const networks = ['ethereum', 'bsc', 'arbitrum', 'base'];
  for (const network of networks) {
    console.log(`🌐 Monitoring Network: ${network.toUpperCase()}`);
    await processNetworkTransfer(network);
  }

  console.log(`\n🕒 Monitoring interval: ${MONITORING_INTERVAL / 1000} seconds.\n`);
};

// Jalankan fungsi monitoring dengan interval yang diatur
if (require.main === module) {
  setInterval(() => {
    main().catch((err) => {
      console.error(`❌ Error in main function: ${err.message}`);
    });
  }, MONITORING_INTERVAL);
}
