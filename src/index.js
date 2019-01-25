const {
  BaseKonnector,
  requestFactory,
  signin,
  createCozyPDFDocument,
  htmlToPDF,
  saveBills,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  cheerio: true,
  json: false,
  jar: true
})

const baseUrl = 'https://www.showroomprive.com/'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Parse documents')
  const orderPage = await request({
    uri: `${baseUrl}/moncompte/mescommandes.aspx`
  })

  const documents = await parseDocuments(orderPage.html())

  log('info', 'Saving data to Cozy')
  await saveBills(documents, fields, {
    identifiers: ['showroomprive'],
    contentType: 'application/pdf'
  })
}

function authenticate(username, password) {
  return signin({
    url: baseUrl,
    formSelector: 'form',
    formData: {
      Login$tbLogin: username,
      Login$tbPass: password,
      __EVENTTARGET: 'Login$LienLogin'
    },

    validate: (statusCode, $, fullResponse) => {
      if (
        $('.icon-mon_compte').length != 0 ||
        fullResponse.request.uri.href ==
          'https://www.showroomprive.com/accueil.aspx'
      ) {
        return true
      } else {
        log('error', $('#Login_ValidationSummaryLogin').text())
        return false
      }
    }
  })
}

async function parseDocuments(page) {
  let docs = []
  // Get json array of orders (from the retreived js code)
  page = page.split('\n')
  page.every(line => {
    if (line.includes('OrderCtrl.JSONGlobalMesCommandes =')) {
      line = line.replace(';', '')
      line = line.split('[')
      const orders = JSON.parse('[' + line[1])
      docs = createDocs(orders)
      return false
    }
    return true
  })

  // Add required fields for savebBills
  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i]

    doc.filestream = await createPDFs(doc)
    doc.filestream.end()

    docs[i] = {
      ...doc,
      currency: '€',
      vendor: 'showroomprive',
      filename: `${doc.formatedDate}_showroomprive_${doc.amount}€_${
        doc.vendorRef
      }.pdf`,
      metadata: {
        importDate: new Date(),
        version: 1
      }
    }
    delete docs[i].formatedDate
  }
  return docs
}

/**
 * Create a pdf for the given document
 * @param {*} doc : the document
 * @return the PDF
 */
async function createPDFs(doc) {
  const fileUrl = `https://www.showroomprive.com/moncompte/iframe/imprimefacture.aspx?commandeid=${
    doc.vendorRef
  }`
  const $doc = await request(fileUrl)
  var pdf = createCozyPDFDocument('Généré par Cozy', fileUrl)
  htmlToPDF($doc, pdf, $doc('table < div'), { baseUrl: fileUrl })
  return pdf
}

/**
 * Create documents to save them as bills
 * @param {*} orders : the list of orders to convert to documents
 * @return list of all documents
 */
function createDocs(orders) {
  let docs = []
  orders.forEach(order => {
    let doc = {}
    doc.vendorRef = order.orderId.toString()
    doc.date = parseDate(order.createShortDate)
    doc.amount = order.amount
    doc.formatedDate = `${doc.date.getFullYear()}-${(
      '0' +
      (doc.date.getMonth() + 1)
    ).slice(-2)}-${('0' + doc.date.getDate()).slice(-2)}`
    docs.push(doc)
  })
  return docs
}

function parseDate(date) {
  let [day] = date.split(' ')
  day = day.split('/').reverse()
  const year = day.shift()
  day.push(year)
  day = day.join('/')
  return new Date(`${day}`)
}
