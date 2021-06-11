import rinkebyAddresses from './addresses.json'
import mainnetAddresses from '@zoralabs/core/dist/addresses/1.json'
import maticTestAddresses from './maticTestAddresses.json'
import bscTestAddresses from './bscTestAddresses.json'

interface AddressBook {
  [key: string]: {
    [key: string]: string
  }
}

/**
 * Mapping from Network to Officially Deployed Instances of the Zora Media Protocol
 */
export const addresses: AddressBook = {
  rinkeby: rinkebyAddresses,
  mainnet: mainnetAddresses,
  maticTest: maticTestAddresses,
  bscTest: bscTestAddresses,
}
