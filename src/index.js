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

  log('info', 'Parse documents')
  // Get orders page
  const orderPage = await request({
    uri: `${baseUrl}/moncompte/mescommandes.aspx`,
    method: 'GET',
    cheerio: false
  })

  const documents = parseDocuments(orderPage.html())
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
  let docs = []
  // Get json array of orders (in the retreived js code)
  page = page.split('\n')
  page.every(line => {
    if (line.includes('OrderCtrl.JSONGlobalMesCommandes =')) {
      line = line.replace(';', '')
      line = line.split('[')
      const orders = JSON.parse('[' + line[1])
      orders.forEach(order => {
        let doc = {}
        doc.vendorRef = order.orderId
        doc.date = parseDate(order.createShortDate)
        doc.amount = order.amount
        docs.push(doc)
      })
      return false
    }
    return true
  })

  return docs.map(doc => ({
    ...doc,
    currency: '€',
    vendor: 'showroomprive',
    metadata: {
      importDate: new Date(),
      version: 1
    }
  }))
}

function parseDate(date) {
    let [day, time] = date.split(' ')
    day = day.split('/').reverse()
    const year = day.shift()
    day.push(year)
    day = day.join('/')
    return new Date(`${day}`)
}
