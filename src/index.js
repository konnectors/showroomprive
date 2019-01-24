const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  // the debug mode shows all the details about http request and responses. Very useful for
  // debugging but very verbose. That is why it is commented out by default
  // debug: true,
  // activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: true,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: false,
  // this allows request-promise to keep cookies between requests
  jar: true
})

const baseUrl = 'https://www.showroomprive.com/'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  // Get orders page
  request({
    uri: `${baseUrl}/moncompte/mescommandes.aspx`,
    method: 'GET'
  }, (error, response, body) => {
    parseDocuments(body)
  })

  //* Suite du code
  // here we use the saveBills function even if what we fetch are not bills, but this is the most
  // common case in connectors
  /*log('info', 'Saving data to Cozy')
  await saveBills(documents, fields, {
    identifiers: ['books']
  }) */
}

function authenticate(username, password) {
  return signin({
    url: baseUrl,
    formSelector: 'form',
    formData: {
      'Login$tbLogin': username,
      'Login$tbPass': password,
      '__EVENTTARGET': 'Login$LienLogin'
    },

    validate: (statusCode, $, fullResponse) => {
      if ($('.icon-mon_compte').length != 0 || fullResponse.request.uri.href == 'https://www.showroomprive.com/accueil.aspx') {
        return true
      } else {
        log('error', $('#Login_ValidationSummaryLogin').text())
        return false
      }
    }
  })
}

function parseDocuments(page) {
  let docs
  // Get json array of orders (in the retreived js code)
  page = page.split('\n')
  page.forEach(line => {
    if (line.includes('OrderCtrl.JSONGlobalMesCommandes =')) {
      line = line.replace(';', '')
      line = line.split('[')
      const orders = JSON.parse('[' + line[1])
    }
  })

  /* return docs.map(doc => ({
    ...doc,
    // the saveBills function needs a date field
    // even if it is a little artificial here (these are not real bills)
    date: new Date(),
    currency: '€',
    vendor: 'template',
    metadata: {
      // it can be interesting that we add the date of import. This is not mandatory but may be
      // useful for debugging or data migration
      importDate: new Date(),
      // document version, useful for migration after change of document structure
      version: 1
    }
  })) */
}

// convert a price string to a float
function normalizePrice(price) {
  return parseFloat(price.replace('£', '').trim())
}
