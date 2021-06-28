import {
  Ask,
  Bid,
  BidShares,
  constructAsk,
  constructBid,
  constructBidShares,
  constructMediaData,
  Decimal,
  EIP712Signature,
  generateMetadata,
  MediaData,
  sha256FromBuffer,
  signMintWithSigMessage,
  signPermitMessage,
  Zap,
} from '../src'
import { JsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'
import { addresses as ZapAddresses } from '../src/addresses'
import { deployCurrency, setupZap, ZapConfiguredAddresses } from './helpers'
import { Blockchain, generatedWallets } from '@levinhs/core/dist/utils'
import { BigNumber, Bytes } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'
import { AddressZero } from '@ethersproject/constants'
import { MediaFactory } from 'node_modules/@levinhs/core/typechain/MediaFactory'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'
import { promises as fs } from 'fs'

let provider = new JsonRpcProvider()
let blockchain = new Blockchain(provider)
jest.setTimeout(1000000)

describe('Zap', () => {
  describe('#constructor', () => {
    it('throws an error if a mediaAddress is specified but not a marketAddress', () => {
      const wallet = Wallet.createRandom()
      expect(function () {
        new Zap(wallet, 4, '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401')
      }).toThrow(
        'Zap Constructor: mediaAddress and marketAddress must both be non-null or both be null'
      )
    })

    it('throws an error if the marketAddress is specified but not a mediaAddress', () => {
      const wallet = Wallet.createRandom()
      expect(function () {
        new Zap(wallet, 4, '', '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401')
      }).toThrow(
        'Zap Constructor: mediaAddress and marketAddress must both be non-null or both be null'
      )
    })

    it('throws an error if one of the market or media addresses in not a valid ethereum address', () => {
      const wallet = Wallet.createRandom()
      expect(function () {
        new Zap(
          wallet,
          4,
          'not a valid ethereum address',
          '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401'
        )
      }).toThrow('Invariant failed: not a valid ethereum address is not a valid address')

      expect(function () {
        new Zap(
          wallet,
          4,
          '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401',
          'not a valid ethereum address'
        )
      }).toThrow('Invariant failed: not a valid ethereum address is not a valid address')
    })

    it('throws an error if the chainId does not map to a network with deployed instance of the Zap Protocol', () => {
      const wallet = Wallet.createRandom()

      expect(function () {
        new Zap(wallet, 50)
      }).toThrow(
        'Invariant failed: chainId 50 not officially supported by the Zap Protocol'
      )
    })

    it('throws an error if the chainId does not map to a network with deployed instance of the Zap Protocol', () => {
      const wallet = Wallet.createRandom()

      expect(function () {
        new Zap(
          wallet,
          50,
          '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401',
          '0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48'
        )
      }).not.toThrow(
        'Invariant failed: chainId 50 not officially supported by the Zap Protocol'
      )
    })

    it('sets the Zap instance to readOnly = false if a signer is specified', () => {
      const wallet = Wallet.createRandom()

      const zap = new Zap(
        wallet,
        50,
        '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401',
        '0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48'
      )
      expect(zap.readOnly).toBe(false)
    })

    it('sets the Zap instance to readOnly = true if a signer is specified', () => {
      const provider = new JsonRpcProvider()

      const zap = new Zap(
        provider,
        50,
        '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401',
        '0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48'
      )
      expect(zap.readOnly).toBe(true)
    })

    it('initializes a Zap instance with the checksummed media and market address for the specified chainId', () => {
      const wallet = Wallet.createRandom()
      const rinkebyMediaAddress = ZapAddresses['rinkeby'].media
      const rinkebyMarketAddress = ZapAddresses['rinkeby'].market
      const zap = new Zap(wallet, 4)
      expect(zap.marketAddress).toBe(rinkebyMarketAddress)
      expect(zap.mediaAddress).toBe(rinkebyMediaAddress)
      expect(zap.market.address).toBe(rinkebyMarketAddress)
      expect(zap.media.address).toBe(rinkebyMediaAddress)
    })

    it('initializes a Zap instance with the specified media and market address if they are passed in', () => {
      const wallet = Wallet.createRandom()
      const mediaAddress = '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401'
      const marketAddress = '0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48'

      const zap = new Zap(wallet, 50, mediaAddress, marketAddress)
      expect(zap.readOnly).toBe(false)
      expect(zap.marketAddress).toBe(marketAddress)
      expect(zap.mediaAddress).toBe(mediaAddress)
      expect(zap.market.address).toBe(marketAddress)
      expect(zap.media.address).toBe(mediaAddress)

      const zap1 = new Zap(wallet, 50, mediaAddress, marketAddress)
      expect(zap1.readOnly).toBe(false)
      expect(zap1.marketAddress).toBe(marketAddress)
      expect(zap1.mediaAddress).toBe(mediaAddress)
      expect(zap1.market.address).toBe(marketAddress)
      expect(zap1.media.address).toBe(mediaAddress)
    })
  })

  describe('contract functions', () => {
    let zapConfig: ZapConfiguredAddresses
    let provider = new JsonRpcProvider()
    let [mainWallet, otherWallet] = generatedWallets(provider)
    //let mainWallet = generatedWallets(provider)[0]

    beforeEach(async () => {
      await blockchain.resetAsync()
      zapConfig = await setupZap(mainWallet, [otherWallet])
    })

    /******************
     * Write Functions
     ******************
     */

    describe('Write Functions', () => {
      let contentHash: string
      let contentHashBytes: Bytes
      let metadataHash: string
      let metadataHashBytes: Bytes
      let metadata: any
      let minifiedMetadata: string

      let defaultMediaData: MediaData
      let defaultBidShares: BidShares
      let defaultAsk: Ask
      let defaultBid: Bid
      let eipSig: EIP712Signature

      beforeEach(() => {
        metadata = {
          version: 'zap-20210101',
          name: 'blah blah',
          description: 'blah blah blah',
          mimeType: 'text/plain',
        }
        minifiedMetadata = generateMetadata(metadata.version, metadata)
        metadataHash = sha256FromBuffer(Buffer.from(minifiedMetadata))
        contentHash = sha256FromBuffer(Buffer.from('invert'))

        defaultMediaData = constructMediaData(
          'https://example.com',
          'https://metadata.com',
          contentHash,
          metadataHash
        )
        defaultBidShares = constructBidShares(10, 90, 0)
        defaultAsk = constructAsk(zapConfig.currency, Decimal.new(100).value)
        defaultBid = constructBid(
          zapConfig.currency,
          Decimal.new(99).value,
          otherWallet.address,
          otherWallet.address,
          10
        )

        eipSig = {
          deadline: 1000,
          v: 0,
          r: '0x00',
          s: '0x00',
        }
      })

      describe('#updateContentURI', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.updateContentURI(0, 'new uri')).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('throws an error if the tokenURI does not begin with `https://`', async () => {
          const zap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          await zap.mint(defaultMediaData, defaultBidShares)
          await expect(zap.updateContentURI(0, 'http://example.com')).rejects.toBe(
            'Invariant failed: http://example.com must begin with `https://`'
          )
        })

        it('updates the content uri', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)

          const tokenURI = await mainZap.fetchContentURI(0)
          expect(tokenURI).toEqual(defaultMediaData.tokenURI)

          await mainZap.updateContentURI(0, 'https://newURI.com')

          const newTokenURI = await mainZap.fetchContentURI(0)
          expect(newTokenURI).toEqual('https://newURI.com')
        })
      })

      describe('#updateMetadataURI', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.updateMetadataURI(0, 'new uri')).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('throws an error if the metadataURI does not begin with `https://`', async () => {
          const zap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          await zap.mint(defaultMediaData, defaultBidShares)
          await expect(zap.updateMetadataURI(0, 'http://example.com')).rejects.toBe(
            'Invariant failed: http://example.com must begin with `https://`'
          )
        })

        it('updates the metadata uri', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)

          const metadataURI = await mainZap.fetchMetadataURI(0)
          expect(metadataURI).toEqual(defaultMediaData.metadataURI)

          await mainZap.updateMetadataURI(0, 'https://newMetadataURI.com')

          const newMetadataURI = await mainZap.fetchMetadataURI(0)
          expect(newMetadataURI).toEqual('https://newMetadataURI.com')
        })
      })

      describe('#mint', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.mint(defaultMediaData, defaultBidShares)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('throws an error if bid shares do not sum to 100', async () => {
          const zap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          const invalidBidShares = {
            prevOwner: Decimal.new(10),
            owner: Decimal.new(70),
            creator: Decimal.new(10),
          }
          expect(zap.readOnly).toBe(false)

          await expect(zap.mint(defaultMediaData, invalidBidShares)).rejects.toBe(
            'Invariant failed: The BidShares sum to 90000000000000000000, but they must sum to 100000000000000000000'
          )
        })

        it('throws an error if the tokenURI does not begin with `https://`', async () => {
          const zap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          const invalidMediaData = {
            tokenURI: 'http://example.com',
            metadataURI: 'https://metadata.com',
            contentHash: contentHashBytes,
            metadataHash: metadataHashBytes,
          }
          expect(zap.readOnly).toBe(false)

          await expect(zap.mint(invalidMediaData, defaultBidShares)).rejects.toBe(
            'Invariant failed: http://example.com must begin with `https://`'
          )
        })

        it('throws an error if the metadataURI does not begin with `https://`', async () => {
          const zap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          const invalidMediaData = {
            tokenURI: 'https://example.com',
            metadataURI: 'http://metadata.com',
            contentHash: contentHashBytes,
            metadataHash: metadataHashBytes,
          }
          expect(zap.readOnly).toBe(false)

          await expect(zap.mint(invalidMediaData, defaultBidShares)).rejects.toBe(
            'Invariant failed: http://metadata.com must begin with `https://`'
          )
        })

        it('pads the gas limit by 10%', async () => {
          const otherZapConfig = await setupZap(otherWallet, [mainWallet])
          const zapMedia = MediaFactory.connect(zapConfig.media, mainWallet)
          const tx = await zapMedia.mint(defaultMediaData, defaultBidShares)
          const otherZap = new Zap(
            otherWallet,
            50,
            otherZapConfig.media,
            otherZapConfig.market
          )
          const paddedTx = await otherZap.mint(defaultMediaData, defaultBidShares)

          expect(paddedTx.gasLimit).toEqual(tx.gasLimit.mul(110).div(100))
        })

        it('creates a new piece of media', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          const totalSupply = await mainZap.fetchTotalMedia()
          expect(totalSupply.toNumber()).toEqual(0)

          await mainZap.mint(defaultMediaData, defaultBidShares)

          const owner = await mainZap.fetchOwnerOf(0)
          const creator = await mainZap.fetchCreator(0)
          const onChainContentHash = await mainZap.fetchContentHash(0)
          const onChainMetadataHash = await mainZap.fetchMetadataHash(0)

          const onChainBidShares = await mainZap.fetchCurrentBidShares(0)
          const onChainContentURI = await mainZap.fetchContentURI(0)
          const onChainMetadataURI = await mainZap.fetchMetadataURI(0)

          expect(owner.toLowerCase()).toBe(mainWallet.address.toLowerCase())
          expect(creator.toLowerCase()).toBe(mainWallet.address.toLowerCase())
          expect(onChainContentHash).toBe(contentHash)
          expect(onChainContentURI).toBe(defaultMediaData.tokenURI)
          expect(onChainMetadataURI).toBe(defaultMediaData.metadataURI)
          expect(onChainMetadataHash).toBe(metadataHash)
          expect(onChainBidShares.creator.value).toEqual(defaultBidShares.creator.value)
          expect(onChainBidShares.owner.value).toEqual(defaultBidShares.owner.value)
          expect(onChainBidShares.prevOwner.value).toEqual(
            defaultBidShares.prevOwner.value
          )
        })
      })

      describe('#mintWithSig', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(
            zap.mintWithSig(
              otherWallet.address,
              defaultMediaData,
              defaultBidShares,
              eipSig
            )
          ).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('throws an error if bid shares do not sum to 100', async () => {
          const zap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          const invalidBidShares = {
            prevOwner: Decimal.new(10),
            owner: Decimal.new(70),
            creator: Decimal.new(10),
          }
          expect(zap.readOnly).toBe(false)

          await expect(
            zap.mintWithSig(
              otherWallet.address,
              defaultMediaData,
              invalidBidShares,
              eipSig
            )
          ).rejects.toBe(
            'Invariant failed: The BidShares sum to 90000000000000000000, but they must sum to 100000000000000000000'
          )
        })

        it('throws an error if the tokenURI does not begin with `https://`', async () => {
          const zap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          const invalidMediaData = {
            tokenURI: 'http://example.com',
            metadataURI: 'https://metadata.com',
            contentHash: contentHashBytes,
            metadataHash: metadataHashBytes,
          }
          expect(zap.readOnly).toBe(false)

          await expect(
            zap.mintWithSig(
              otherWallet.address,
              invalidMediaData,
              defaultBidShares,
              eipSig
            )
          ).rejects.toBe(
            'Invariant failed: http://example.com must begin with `https://`'
          )
        })

        it('throws an error if the metadataURI does not begin with `https://`', async () => {
          const zap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          const invalidMediaData = {
            tokenURI: 'https://example.com',
            metadataURI: 'http://metadata.com',
            contentHash: contentHashBytes,
            metadataHash: metadataHashBytes,
          }
          expect(zap.readOnly).toBe(false)

          await expect(zap.mint(invalidMediaData, defaultBidShares)).rejects.toBe(
            'Invariant failed: http://metadata.com must begin with `https://`'
          )
        })

        it('creates a new piece of media', async () => {
          const otherZap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          const deadline = Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24 // 24 hours
          const domain = otherZap.eip712Domain()
          let nonce = await otherZap.fetchMintWithSigNonce(mainWallet.address)
          // nonce.add(1);
          const eipSig = await signMintWithSigMessage(
            mainWallet,
            contentHash,
            metadataHash,
            Decimal.new(10).value,
            nonce.toNumber(),
            deadline,
            domain
          )

          const totalSupply = await otherZap.fetchTotalMedia()
          expect(totalSupply.toNumber()).toEqual(0)

          await otherZap.mintWithSig(
            mainWallet.address,
            defaultMediaData,
            defaultBidShares,
            eipSig
          )

          const owner = await otherZap.fetchOwnerOf(0)
          const creator = await otherZap.fetchCreator(0)
          const onChainContentHash = await otherZap.fetchContentHash(0)
          const onChainMetadataHash = await otherZap.fetchMetadataHash(0)

          const onChainBidShares = await otherZap.fetchCurrentBidShares(0)
          const onChainContentURI = await otherZap.fetchContentURI(0)
          const onChainMetadataURI = await otherZap.fetchMetadataURI(0)

          expect(owner.toLowerCase()).toBe(mainWallet.address.toLowerCase())
          expect(creator.toLowerCase()).toBe(mainWallet.address.toLowerCase())
          expect(onChainContentHash).toBe(contentHash)
          expect(onChainContentURI).toBe(defaultMediaData.tokenURI)
          expect(onChainMetadataURI).toBe(defaultMediaData.metadataURI)
          expect(onChainMetadataHash).toBe(metadataHash)
          expect(onChainBidShares.creator.value).toEqual(defaultBidShares.creator.value)
          expect(onChainBidShares.owner.value).toEqual(defaultBidShares.owner.value)
          expect(onChainBidShares.prevOwner.value).toEqual(
            defaultBidShares.prevOwner.value
          )
        })
      })

      describe('#setAsk', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.setAsk(0, defaultAsk)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('sets an ask for a piece of media', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)

          await mainZap.setAsk(0, defaultAsk)

          const onChainAsk = await mainZap.fetchCurrentAsk(0)
          expect(onChainAsk.currency.toLowerCase()).toEqual(
            defaultAsk.currency.toLowerCase()
          )
          expect(parseFloat(formatUnits(onChainAsk.amount, 'wei'))).toEqual(
            parseFloat(formatUnits(defaultAsk.amount, 'wei'))
          )
        })
      })

      describe('#setBid', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.setBid(0, defaultBid)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('creates a new bid on chain', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)

          const otherZap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          const nullOnChainBid = await otherZap.fetchCurrentBidForBidder(
            0,
            otherWallet.address
          )

          expect(nullOnChainBid.currency).toEqual(AddressZero)

          await otherZap.setBid(0, defaultBid)
          const onChainBid = await otherZap.fetchCurrentBidForBidder(
            0,
            otherWallet.address
          )

          expect(parseFloat(formatUnits(onChainBid.amount, 'wei'))).toEqual(
            parseFloat(formatUnits(onChainBid.amount, 'wei'))
          )
          expect(onChainBid.currency.toLowerCase()).toEqual(
            defaultBid.currency.toLowerCase()
          )
          expect(onChainBid.bidder.toLowerCase()).toEqual(defaultBid.bidder.toLowerCase())
          expect(onChainBid.recipient.toLowerCase()).toEqual(
            defaultBid.recipient.toLowerCase()
          )
          expect(onChainBid.sellOnShare.value).toEqual(defaultBid.sellOnShare.value)
        })
      })

      describe('#removeAsk', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.removeAsk(0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('removes an ask', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)
          await mainZap.setAsk(0, defaultAsk)

          const onChainAsk = await mainZap.fetchCurrentAsk(0)
          expect(onChainAsk.currency.toLowerCase()).toEqual(
            defaultAsk.currency.toLowerCase()
          )

          await mainZap.removeAsk(0)

          const nullOnChainAsk = await mainZap.fetchCurrentAsk(0)
          expect(nullOnChainAsk.currency).toEqual(AddressZero)
        })
      })

      describe('#removeBid', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.removeBid(0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('removes a bid', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)
          const otherZap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          await otherZap.setBid(0, defaultBid)
          const onChainBid = await otherZap.fetchCurrentBidForBidder(
            0,
            otherWallet.address
          )

          expect(parseFloat(formatUnits(onChainBid.amount, 'wei'))).toEqual(
            parseFloat(formatUnits(onChainBid.amount, 'wei'))
          )
          expect(onChainBid.currency.toLowerCase()).toEqual(
            defaultBid.currency.toLowerCase()
          )
          expect(onChainBid.bidder.toLowerCase()).toEqual(defaultBid.bidder.toLowerCase())
          expect(onChainBid.recipient.toLowerCase()).toEqual(
            defaultBid.recipient.toLowerCase()
          )
          expect(onChainBid.sellOnShare.value).toEqual(defaultBid.sellOnShare.value)

          await otherZap.removeBid(0)

          const nullOnChainBid = await otherZap.fetchCurrentBidForBidder(
            0,
            otherWallet.address
          )

          expect(nullOnChainBid.currency).toEqual(AddressZero)
        })
      })

      describe('#acceptBid', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.acceptBid(0, defaultBid)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('accepts a bid', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)
          const otherZap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          await otherZap.setBid(0, defaultBid)
          await mainZap.acceptBid(0, defaultBid)
          const newOwner = await otherZap.fetchOwnerOf(0)
          expect(newOwner.toLowerCase()).toEqual(otherWallet.address.toLowerCase())
        })
      })

      describe('#permit', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.permit(otherWallet.address, 0, eipSig)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('grants approval to a different address', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)
          const otherZap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)

          const deadline = Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24 // 24 hours
          const domain = mainZap.eip712Domain()
          const eipSig = await signPermitMessage(
            mainWallet,
            otherWallet.address,
            0,
            0,
            deadline,
            domain
          )

          await otherZap.permit(otherWallet.address, 0, eipSig)
          const approved = await otherZap.fetchApproved(0)
          expect(approved.toLowerCase()).toBe(otherWallet.address.toLowerCase())
        })
      })

      describe('#revokeApproval', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.revokeApproval(0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it("revokes an addresses approval of another address's media", async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)
          await mainZap.approve(otherWallet.address, 0)
          const approved = await mainZap.fetchApproved(0)
          expect(approved.toLowerCase()).toBe(otherWallet.address.toLowerCase())

          const otherZap = new Zap(otherWallet, 50, zapConfig.media, zapConfig.market)
          await otherZap.revokeApproval(0)
          const nullApproved = await mainZap.fetchApproved(0)
          expect(nullApproved).toBe(AddressZero)
        })
      })

      describe('#burn', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.burn(0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('burns a piece of media', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)

          const owner = await mainZap.fetchOwnerOf(0)
          expect(owner.toLowerCase()).toEqual(mainWallet.address.toLowerCase())

          const totalSupply = await mainZap.fetchTotalMedia()
          expect(totalSupply.toNumber()).toEqual(1)

          await mainZap.burn(0)

          const zeroSupply = await mainZap.fetchTotalMedia()
          expect(zeroSupply.toNumber()).toEqual(0)
        })
      })

      describe('#approve', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.approve(otherWallet.address, 0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('grants approval for another address for a piece of media', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)
          const nullApproved = await mainZap.fetchApproved(0)
          expect(nullApproved).toBe(AddressZero)
          await mainZap.approve(otherWallet.address, 0)
          const approved = await mainZap.fetchApproved(0)
          expect(approved.toLowerCase()).toBe(otherWallet.address.toLowerCase())
        })
      })

      describe('#setApprovalForAll', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(zap.setApprovalForAll(otherWallet.address, true)).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('sets approval for another address for all media owned by owner', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)
          const notApproved = await mainZap.fetchIsApprovedForAll(
            mainWallet.address,
            otherWallet.address
          )
          expect(notApproved).toBe(false)
          await mainZap.setApprovalForAll(otherWallet.address, true)
          const approved = await mainZap.fetchIsApprovedForAll(
            mainWallet.address,
            otherWallet.address
          )
          expect(approved).toBe(true)

          await mainZap.setApprovalForAll(otherWallet.address, false)
          const revoked = await mainZap.fetchIsApprovedForAll(
            mainWallet.address,
            otherWallet.address
          )
          expect(revoked).toBe(false)
        })
      })

      describe('#transferFrom', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(
            zap.transferFrom(mainWallet.address, otherWallet.address, 0)
          ).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })

        it('transfers media to another address', async () => {
          const mainZap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await mainZap.mint(defaultMediaData, defaultBidShares)
          const owner = await mainZap.fetchOwnerOf(0)
          expect(owner.toLowerCase()).toEqual(mainWallet.address.toLowerCase())

          await mainZap.transferFrom(mainWallet.address, otherWallet.address, 0)
          const newOwner = await mainZap.fetchOwnerOf(0)
          expect(newOwner.toLowerCase()).toEqual(otherWallet.address.toLowerCase())
        })
      })

      describe('#safeTransferFrom', () => {
        it('throws an error if called on a readOnly Zap instance', async () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          expect(zap.readOnly).toBe(true)

          await expect(
            zap.safeTransferFrom(mainWallet.address, otherWallet.address, 0)
          ).rejects.toBe(
            'ensureNotReadOnly: readOnly Zap instance cannot call contract methods that require a signer.'
          )
        })
      })

      describe('#eip712Domain', () => {
        it('returns chainId 1 on a local blockchain', () => {
          const provider = new JsonRpcProvider()

          const zap = new Zap(provider, 50, zapConfig.media, zapConfig.market)
          const domain = zap.eip712Domain()
          expect(domain.chainId).toEqual(1)
          expect(domain.verifyingContract.toLowerCase()).toEqual(
            zap.mediaAddress.toLowerCase()
          )
        })

        it('returns the zap chainId', () => {
          const provider = new JsonRpcProvider()
          const zap = new Zap(provider, 4, zapConfig.media, zapConfig.market)
          const domain = zap.eip712Domain()

          expect(domain.chainId).toEqual(4)
          expect(domain.verifyingContract.toLowerCase()).toEqual(
            zap.mediaAddress.toLowerCase()
          )
        })
      })

      describe('#isValidBid', () => {
        it('returns true if the bid amount can be evenly split by current bidShares', async () => {
          const zap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await zap.mint(defaultMediaData, defaultBidShares)
          const isValid = await zap.isValidBid(0, defaultBid)
          expect(isValid).toEqual(true)
        })

        it('returns false if the bid amount cannot be evenly split by current bidShares', async () => {
          const cur = await deployCurrency(mainWallet, 'CUR', 'CUR', 2)
          const zap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          const bid = constructBid(
            cur,
            BigNumber.from(200),
            otherWallet.address,
            otherWallet.address,
            10
          )

          const preciseBidShares = {
            creator: Decimal.new(33.3333),
            owner: Decimal.new(33.3333),
            prevOwner: Decimal.new(33.3334),
          }

          await zap.mint(defaultMediaData, preciseBidShares)
          const isValid = await zap.isValidBid(0, bid)
          expect(isValid).toEqual(false)
        })

        it('returns false if the sell on share is invalid', async () => {
          const zap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await zap.mint(defaultMediaData, defaultBidShares)

          const bid = constructBid(
            zapConfig.currency,
            BigNumber.from(200),
            otherWallet.address,
            otherWallet.address,
            90.1
          )

          const isValid = await zap.isValidBid(0, bid)
          expect(isValid).toEqual(false)
        })
      })

      describe('#isValidAsk', () => {
        it('returns true if the ask amount can be evenly split by current bidShares', async () => {
          const zap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await zap.mint(defaultMediaData, defaultBidShares)
          const isValid = await zap.isValidAsk(0, defaultAsk)
          expect(isValid).toEqual(true)
        })

        it('returns false if the ask amount cannot be evenly split by current bidShares', async () => {
          const cur = await deployCurrency(mainWallet, 'CUR', 'CUR', 2)
          const zap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          const ask = constructAsk(cur, BigNumber.from(200))

          const preciseBidShares = {
            creator: Decimal.new(33.3333),
            owner: Decimal.new(33.3333),
            prevOwner: Decimal.new(33.3334),
          }

          await zap.mint(defaultMediaData, preciseBidShares)
          const isValid = await zap.isValidAsk(0, ask)
          expect(isValid).toEqual(false)
        })
      })

      describe('#isVerifiedMedia', () => {
        it('returns true if the media is verified', async () => {
          const zap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          const mock = new MockAdapter(axios)
          const helloWorldBuf = await fs.readFile('./fixtures/HelloWorld.txt')
          const helloWorldURI =
            'https://ipfs/io/ipfs/Qmf1rtki74jvYmGeqaaV51hzeiaa6DyWc98fzDiuPatzyy'
          const kanyeBuf = await fs.readFile('./fixtures/kanye.jpg')
          const kanyeURI =
            'https://ipfs.io/ipfs/QmRhK7o7gpjkkpubu9EvqDGJEgY1nQxSkP7XsMcaX7pZwV'

          mock.onGet(kanyeURI).reply(200, kanyeBuf)
          mock.onGet(helloWorldURI).reply(200, helloWorldBuf)

          const mediaData = constructMediaData(
            kanyeURI,
            helloWorldURI,
            sha256FromBuffer(kanyeBuf),
            sha256FromBuffer(helloWorldBuf)
          )
          await zap.mint(mediaData, defaultBidShares)

          const verified = await zap.isVerifiedMedia(0)
          expect(verified).toEqual(true)
        })

        it('returns false if the media is not verified', async () => {
          const zap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          const mock = new MockAdapter(axios)
          const helloWorldBuf = await fs.readFile('./fixtures/HelloWorld.txt')
          const helloWorldURI =
            'https://ipfs/io/ipfs/Qmf1rtki74jvYmGeqaaV51hzeiaa6DyWc98fzDiuPatzyy'
          const kanyeBuf = await fs.readFile('./fixtures/kanye.jpg')
          const kanyeURI =
            'https://ipfs.io/ipfs/QmRhK7o7gpjkkpubu9EvqDGJEgY1nQxSkP7XsMcaX7pZwV'

          mock.onGet(kanyeURI).reply(200, kanyeBuf)
          mock.onGet(helloWorldURI).reply(200, kanyeBuf) // this will cause verification to fail!

          const mediaData = constructMediaData(
            kanyeURI,
            helloWorldURI,
            sha256FromBuffer(kanyeBuf),
            sha256FromBuffer(helloWorldBuf)
          )
          await zap.mint(mediaData, defaultBidShares)

          const verified = await zap.isVerifiedMedia(0)
          expect(verified).toEqual(false)
        })

        it('rejects the promise if the media does not exist', async () => {
          const zap = new Zap(mainWallet, 50, zapConfig.media, zapConfig.market)
          await expect(zap.isVerifiedMedia(0)).rejects.toContain(
            'token with that id does not exist'
          )
        })
      })
    })
  })
})
