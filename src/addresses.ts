import rinkebyAddresses from './addresses.json'
// import mainnetAddresses from '@levinhs/core/dist/addresses1.json'
import maticTestAddresses from './maticTestAddresses.json'
import bscTestAddresses from './bscTestAddresses.json'

interface AddressBook {
  [key: string]: {
    [key: string]: string
  }
}

/**
 * Mapping from Network to Officially Deployed Instances of the Zap Media Protocol
 */
export const addresses: AddressBook = {
  rinkeby: rinkebyAddresses,
  // mainnet: mainnetAddresses,
  Mumbai: maticTestAddresses,
  BSCTest: bscTestAddresses,
}
