import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { getZapProfiles } from '../src'

jest.setTimeout(1000000)

describe('Users', () => {
  describe('getZapProfiles', () => {
    const zapProfilesApiUri = 'https://zora.co/api/users'
    describe('success', () => {
      it('makes a POST request to /api/users and returns data', async () => {
        let mock = new MockAdapter(axios)
        mock.onPost(zapProfilesApiUri).reply(200, [{ foo: 'bar' }])
        const profiles = await getZapProfiles(['test'])
        expect(profiles).toEqual([{ foo: 'bar' }])
      })
    })
    describe('input validation', () => {
      it('raises if empty addresses', async () => {
        const spy = jest.spyOn(axios, 'post')
        try {
          await getZapProfiles([])
          throw new Error('should throw')
        } catch (err) {
          expect(err).toEqual(Error('Empty addresses array'))
        }
        expect(spy).not.toHaveBeenCalled()
      })

      it('raises if too many addresses', async () => {
        const spy = jest.spyOn(axios, 'post')
        const addresses = Array.from(new Array(101), () => '0sdf987sdf')
        try {
          await getZapProfiles(addresses)
          throw new Error('should throw')
        } catch (err) {
          expect(err).toEqual(Error('Addresses array exceeds max length of 100'))
        }
        expect(spy).not.toHaveBeenCalled()
      })
    })

    describe('request error handling', () => {
      let mock: MockAdapter
      beforeEach(() => {
        mock = new MockAdapter(axios)
      })

      it('throws with error message from response', async () => {
        mock.onPost(zapProfilesApiUri).reply(400, 'Custom error message from zap api')
        try {
          await getZapProfiles(['asdf', '1234'])
          throw new Error('should throw')
        } catch (err) {
          expect(err).toEqual(Error('Custom error message from zap api'))
        }
      })

      it('raises if axios request fails', async () => {
        mock.onPost(zapProfilesApiUri).networkError()
        try {
          await getZapProfiles(['asdf', '1234'])
          throw new Error('should throw')
        } catch (err) {
          expect(err).toEqual(Error('Network Error'))
        }
      })
      it('raises if axios response has no data', async () => {
        mock.onPost(zapProfilesApiUri).reply(200, null)
        try {
          await getZapProfiles(['asdf', '1234'])
          throw new Error('should throw')
        } catch (err) {
          expect(err).toEqual(Error('Error retrieving users'))
        }
      })
      it('raises if axios response data is not a list', async () => {
        mock.onPost(zapProfilesApiUri).reply(200, {})
        try {
          await getZapProfiles(['asdf', '1234'])
          throw new Error('should throw')
        } catch (err) {
          expect(err).toEqual(Error('Error retrieving users'))
        }
      })
      it('raises if axios response data is empty', async () => {
        mock.onPost(zapProfilesApiUri).reply(200, [])
        try {
          await getZapProfiles(['asdf', '1234'])
          throw new Error('should throw')
        } catch (err) {
          expect(err).toEqual(Error('Error retrieving users'))
        }
      })
    })
  })
})
