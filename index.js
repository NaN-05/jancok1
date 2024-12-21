require('dotenv').config();
const { ethers } = require('ethers');
const chalk = require('chalk');
const ora = require('ora');

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

// Fungsi untuk memproses transfer di jaringan tertentu
const processNetworkTransfer = async (networkName) => {
  const spinner = ora(`Monitoring ${chalk.blue(networkName)}...`).start();
  const networkConfig = getNetworkConfig(networkName);

  if (!networkConfig || !networkConfig.rpcUrl || !networkConfig.chainId) {
    spinner.fail(`Invalid network configuration for: ${chalk.red(networkName)}`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const depositWallet = new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY, provider);
  const depositWalletAddress = await depositWallet.getAddress();

  try {
    const balance = await provider.getBalance(depositWalletAddress);
    spinner.text = `[${chalk.blue(networkName)}] Balance: ${chalk.green(ethers.formatEther(balance))} ETH`;

    if (balance >= MIN_TRANSFER_AMOUNT) {
      spinner.succeed(`[${chalk.blue(networkName)}] Balance meets the minimum transfer requirement.`);
      const feeData = await provider.getFeeData();
      const gasPrice = (feeData.gasPrice || feeData.maxFeePerGas) * BigInt(1.2); // Tambahkan buffer 20%

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

        spinner.start(`[${chalk.blue(networkName)}] Sending transaction...`);
        const txResponse = await depositWallet.sendTransaction(txDetails);

        spinner.text = `[${chalk.blue(networkName)}] Transaction sent: ${chalk.cyan(txResponse.hash)}`;
        const receipt = await txResponse.wait();

        spinner.succeed(
          `[${chalk.blue(networkName)}] Transaction confirmed in block ${chalk.yellow(
            receipt.blockNumber
          )}. Transferred to ${chalk.green(process.env.VAULT_WALLET_ADDRESS)}`
        );
      } else {
        spinner.warn(`[${chalk.blue(networkName)}] Insufficient balance to cover gas fees.`);
      }
    } else {
      spinner.warn(`[${chalk.blue(networkName)}] Balance is below the minimum transfer amount.`);
    }
  } catch (err) {
    spinner.fail(`[${chalk.blue(networkName)}] Error: ${chalk.red(err.message)}`);
  }
};

// Fungsi utama untuk iterasi melalui semua jaringan
const main = async () => {
  const networks = ['ethereum', 'bsc', 'arbitrum', 'base'];
  console.log(chalk.bold.green('🔄 Starting monitoring process for all networks...\n'));

  for (const networkName of networks) {
    await processNetworkTransfer(networkName);
  }

  console.log(chalk.bold.green('\n✅ Monitoring process completed for all networks.'));
};

// Jalankan fungsi monitoring dengan interval yang diatur
if (require.main === module) {
  console.log(chalk.bold.yellow(`🕒 Monitoring interval set to ${MONITORING_INTERVAL / 1000} seconds.\n`));
  setInterval(() => {
    main().catch((err) => {
      console.error(chalk.bold.red('❌ Error in main function:'), err);
    });
  }, MONITORING_INTERVAL);
}
