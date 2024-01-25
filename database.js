import knex from 'knex'

const host = process.env.HOST
const port = process.env.PORT
const user = process.env.USER
const password = process.env.PASSWORD
const database = process.env.DATABASE

const connection = {
  user,
  password,
  database,
  charset: 'utf8',
  timezone: 'Asia/Tokyo',
  typeCast: function (field, next) {
    if (field.type === 'JSON') {
      return JSON.parse(field.string())
    }
    return next()
  },
  host,
  port
}

export default knex({
  client: 'mysql',
  connection
})
