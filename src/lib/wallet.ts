import * as ecc from '@bitcoinerlab/secp256k1'
import { mnemonicToSeed } from '@scure/bip39'
import { HDKey } from '@scure/bip32'
import { Mnemonic, Satoshis, Utxo, PublicKeys, ScanOnlyKeySet } from './types'
import { NetworkName, getNetwork } from './network'
import { Wallet } from '../providers/wallet'
import { deriveBIP352Keys } from './silentpayment/core/keys'
import { encodeSilentPaymentAddress } from './silentpayment/core/encoding'

export async function getSilentPaymentScanPrivateKey(mnemonic: Mnemonic, network: NetworkName): Promise<Buffer> {
  const seed = await mnemonicToSeed(mnemonic)
  const master = HDKey.fromMasterSeed(seed)
  const { scan } = deriveBIP352Keys(master, network === NetworkName.Mainnet)
  if (!scan.privateKey) throw new Error('Could not derive private key')
  return Buffer.from(scan.privateKey)
}

export async function getSilentPaymentSpendPrivateKey(mnemonic: Mnemonic, network: NetworkName): Promise<Buffer> {
  const seed = await mnemonicToSeed(mnemonic)
  const master = HDKey.fromMasterSeed(seed)
  const { spend } = deriveBIP352Keys(master, network === NetworkName.Mainnet)
  if (!spend.privateKey) throw new Error('Could not derive private key')
  return Buffer.from(spend.privateKey)
}

export async function getSilentPaymentPublicKeys(mnemonic: Mnemonic, network: NetworkName): Promise<PublicKeys> {
  const seed = await mnemonicToSeed(mnemonic)
  const master = HDKey.fromMasterSeed(seed)
  const { scan, spend } = deriveBIP352Keys(master, network === NetworkName.Mainnet)
  if (!scan.publicKey || !spend.publicKey) throw new Error('Could not derive public keys')
  const publicKeys = {
    scanPublicKey: Buffer.from(scan.publicKey).toString('hex'),
    spendPublicKey: Buffer.from(spend.publicKey).toString('hex'),
  }
  return {
    mainnet: publicKeys,
    testnet: publicKeys,
    regtest: publicKeys,
    signet: publicKeys,
  }
}

export async function getSilentPaymentAddress(mnemonic: Mnemonic, network: NetworkName): Promise<string> {
  const seed = await mnemonicToSeed(mnemonic)
  const master = HDKey.fromMasterSeed(seed)
  const { scan, spend } = deriveBIP352Keys(master, network === NetworkName.Mainnet)
  if (!scan.publicKey || !spend.publicKey) throw new Error('Could not derive public keys')
  return encodeSilentPaymentAddress(
    new Uint8Array(scan.publicKey),
    new Uint8Array(spend.publicKey),
    getNetwork(network)
  )
}

export async function getCoinPrivKey(coin: Utxo, network: NetworkName, mnemonic: Mnemonic): Promise<Buffer> {
  if (coin.silentPayment) {
    const spendKeyWallet = await getSilentPaymentSpendPrivateKey(mnemonic, network)
    const privKey = ecc.privateAdd(spendKeyWallet, Buffer.from(coin.silentPayment.tweak, 'hex'))
    if (!privKey) throw new Error('Could not derive private key')
    return Buffer.from(privKey)
  }
  throw new Error('Unsupported coin type')
}

export function getBalance(wallet: Wallet): Satoshis {
  return wallet.utxos[wallet.network].reduce((sum, utxo) => sum + utxo.value, 0)
}

export async function getScanOnlyKeys(mnemonic: Mnemonic, network: NetworkName): Promise<ScanOnlyKeySet>{
  const scanPrivKey = await getSilentPaymentScanPrivateKey(mnemonic, network);
  const pubKeys = await getSilentPaymentPublicKeys(mnemonic, network)

  return {
    scan_priv_key: Buffer.from(scanPrivKey).toString('hex'),
    spend_pub_key: pubKeys[network].spendPublicKey
  }
}

export async function getKeys(mnemonic: Mnemonic): Promise<PublicKeys> {
  const networks: NetworkName[] = [NetworkName.Mainnet, NetworkName.Testnet, NetworkName.Regtest, NetworkName.Signet]
  const keys: PublicKeys = {
    mainnet: { scanPublicKey: '', spendPublicKey: '' },
    testnet: { scanPublicKey: '', spendPublicKey: '' },
    regtest: { scanPublicKey: '', spendPublicKey: '' },
    signet: { scanPublicKey: '', spendPublicKey: '' },
  }

  for (const network of networks) {
    const networkKeys = await getSilentPaymentPublicKeys(mnemonic, network)
    keys[network] = networkKeys[network]
  }

  return keys
}

export function isInitialized(wallet: Wallet): boolean {
  return (
    wallet.publicKeys[wallet.network].scanPublicKey !== '' &&
    wallet.publicKeys[wallet.network].spendPublicKey !== ''
  )
}
