import knex from './database.js'
import excelJS from 'exceljs'
import LatLon from 'geodesy/latlon-ellipsoidal-vincenty.js'

const cStatusLabel = {
  1: '受付',
  2: 'ヒアリング済',
  3: '見込み下',
  11: '空室有メール送信',
  22: '空室有メール送信（直営）',
  23: '空室有メール送信（レオパ）',
  16: '追客メール送信',
  12: '満室メール送信',
  14: '連絡つかず',
  13: '見込み',
  21: '契約調整',
  24: '提案ページ（内容確認済み）',
  31: '成約',
  32: '終了',
  34: '他決',
  35: 'クレーム',
  19: '保有',
  15: '逆引き中',
  17: 'テレアポ中',
  33: 'キャンセル',
  '-21': '名寄せ済',
  301: 'レオパレス問合',
  302: '業者問合',
  18: '自動対応メール送信済',
  401: '自動満室対応対象',
  411: '自動満室メール送信',
  421: '自動名寄せ',
  201: 'フォローメール送信'
}

const calcDistance = (posA, posB) => {
  const pA = new LatLon(posA.lat, posA.lng)
  const pB = new LatLon(posB.lat, posB.lng)

  return pA.distanceTo(pB)
}

const getPsContactLogs = () => {
  return knex('ps_contact_log as ps')
    .select(
      'ps.c_id as cId',
      'ps.c_status as cStatus',
      'ps.user_class as userClass',
      'ps.user_name as userName',
      'ps.company_name as companyName',
      'ps.search_area as searchArea',
      'ps.search_lat as searchLat',
      'ps.search_lon as searchLon',
      'pref.name as prefName',
      'city.name as cityName'
    )
    .leftJoin('location_pref as pref', 'pref.id', 'ps.pref_code')
    .leftJoin('location_city as city', 'city.id', 'ps.city_code')
    .where('ps.marketing_strategy', '>=', 256)
    .where('ps.marketing_strategy', '<', 512)
}

const getCPOLocationParkings = () => {
  return knex('location_parking as lp')
    .select(
      'lp.id as parkingId',
      'lp.name as parkingName',
      'lp.lat',
      'lp.lng',
      knex.raw('MAX(space.total_empty_rooms) as totalEmptyRooms')
    )
    .leftJoin('location_space as space', 'space.parking_id', 'lp.id')
    .whereNotNull('cpo_parking_id')
    .groupBy('lp.id')
}

const mapPsContactLogToNearestCpoParking = (psContactLogs, cpoParkings) => {
  return psContactLogs.map(psContactLog => {
    const nearestCpoParking = getNearestCpoParking(psContactLog, cpoParkings)
    return {
      ...psContactLog,
      nearestCpoParking
    }
  })
}

const getNearestCpoParking = (psContactLog, cpoParkings) => {
  const { searchLat, searchLon } = psContactLog
  const posA = {
    lat: searchLat,
    lng: searchLon
  }
  return cpoParkings.reduce(
    (nearestCpoParking, cpoParking) => {
      const { lat, lng } = cpoParking
      const posB = {
        lat,
        lng
      }
      const distance = calcDistance(posA, posB)
      if (distance < nearestCpoParking.distance) {
        return {
          ...cpoParking,
          distance
        }
      }
      return nearestCpoParking
    },
    {
      distance: Infinity
    }
  )
}

const writeExcel = async (psContactLogs, filename) => {
  const workbook = new excelJS.Workbook()
  const worksheet = workbook.addWorksheet('Sheet1')
  worksheet.columns = [
    { header: 'エリアの都道府県', key: 'prefName', width: 10 },
    { header: 'エリアの市区', key: 'cityName', width: 10 },
    { header: 'ステータス', key: 'cStatusLabel', width: 10 },
    { header: '契約名義', key: 'name', width: 10 },
    { header: '案件ID', key: 'cId', width: 10 },
    { header: '起点住所', key: 'searchArea', width: 10 },
    {
      header: '起点から一番近いCPO物件の距離（〇ｍ）',
      key: 'cpoParkingDistance',
      width: 10
    },
    { header: 'CPO物件名', key: 'cpoParkingName', width: 10 },
    { header: 'CPO物件駐車場ID', key: 'cpoParkingId', width: 10 },
    {
      header: 'CPO物件の空き状況（空き台数or満車）',
      key: 'cpoParkingTotalEmptyRooms',
      width: 10
    },
    { header: '案件ページ', key: 'linkUrl', width: 10 }
  ]

  worksheet.addRows(
    psContactLogs.map(psContactLog => {
      const { nearestCpoParking } = psContactLog
      return {
        ...psContactLog,
        name:
          psContactLog.userClass === 1
            ? psContactLog.companyName
            : psContactLog.userName,
        cStatusLabel: cStatusLabel[psContactLog.cStatus],
        cpoParkingDistance: `${nearestCpoParking.distance}m`,
        cpoParkingName: nearestCpoParking.parkingName,
        cpoParkingId: nearestCpoParking.parkingId,
        cpoParkingTotalEmptyRooms: nearestCpoParking.totalEmptyRooms,
        linkUrl: `https://admin-hs.carparking.jp/admin/user/edit.php?c_id=${psContactLog.cId}`
      }
    })
  )

  await workbook.xlsx.writeFile(filename)
}

const main = async () => {
  const psContactLogs = await getPsContactLogs()
  const cpoParkings = await getCPOLocationParkings()
  const formattedPsContactLogs = mapPsContactLogToNearestCpoParking(
    psContactLogs,
    cpoParkings
  )

  await writeExcel(formattedPsContactLogs, 'output.xlsx')
}

main()
