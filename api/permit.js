// Vercel Serverless Function — 건축인허가 정보 프록시
const DATA_KEY = 'adefbd03bd8c9c5fa02eb99fdf5407043904a1a2b4603f4852a341b62e7b123e';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sigunguCd, bjdongCd, bun } = req.query;
  if (!sigunguCd || !bjdongCd) {
    return res.status(400).json({ error: 'sigunguCd, bjdongCd 필요' });
  }

  try {
    // 1. 건축인허가 기본개요 조회
    const permitUrl = `https://apis.data.go.kr/1613000/ArchPmsService_v2/getApBasisOulnInfo`
      + `?serviceKey=${DATA_KEY}`
      + `&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}`
      + `&numOfRows=10&pageNo=1&_type=json`;

    const r1 = await fetch(permitUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const t1 = await r1.text();

    let permits = [];
    if (t1 && t1.trim() && t1.trim().startsWith('{')) {
      const d1 = JSON.parse(t1);
      const items = d1?.response?.body?.items?.item;
      if (items) permits = Array.isArray(items) ? items : [items];
    }

    // 2. 용도지역지구구역 조회 (건축물대장 지역지구 API)
    const zoneUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrJijiguInfo`
      + `?serviceKey=${DATA_KEY}`
      + `&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}`
      + `&numOfRows=10&pageNo=1&_type=json`;

    const r2 = await fetch(zoneUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const t2 = await r2.text();

    let zones = [];
    if (t2 && t2.trim() && t2.trim().startsWith('{')) {
      const d2 = JSON.parse(t2);
      const items2 = d2?.response?.body?.items?.item;
      if (items2) zones = Array.isArray(items2) ? items2 : [items2];
    }

    // 결과 정리
    const permitList = permits.slice(0, 5).map(p => ({
      archGbCdNm:   String(p.archGbCdNm   || p.archgbcdnm   || ''),
      archGbCd:     String(p.archGbCd     || p.archgbcd     || ''),
      prmsDay:      String(p.prmsDay      || p.prmsday      || ''),
      stcnsDay:     String(p.stcnsDay     || p.stcnsday     || ''),
      useAprDay:    String(p.useAprDay    || p.useaprday    || ''),
      mainPurpsCdNm:String(p.mainPurpsCdNm|| p.mainpurpscdnm|| ''),
      bldNm:        String(p.bldNm        || p.bldnm        || ''),
      grndFlrCnt:   parseInt(p.grndFlrCnt || p.grndflrcnt   || 0),
      totArea:      parseFloat(p.totArea  || p.totarea      || 0),
    }));

    const zoneList = zones.slice(0, 5).map(z => ({
      jiyukCdNm:  String(z.jiyukCdNm  || z.jiyukcdnm  || ''),
      jiguCdNm:   String(z.jiguCdNm   || z.jigucdnm   || ''),
      guyukCdNm:  String(z.guyukCdNm  || z.guyukcdnm  || ''),
      etcJijigu:  String(z.etcJijigu  || z.etcjijigu  || ''),
    })).filter(z => z.jiyukCdNm || z.jiguCdNm);

    return res.status(200).json({
      _v: 'permit-v1',
      permits: permitList,
      zones: zoneList,
      permitCount: permits.length,
      zoneCount: zones.length,
    });

  } catch(e) {
    return res.status(200).json({ error: e.message, permits: [], zones: [] });
  }
}
