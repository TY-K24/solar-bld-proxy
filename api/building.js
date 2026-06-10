// Vercel Serverless Function — 건축물대장 프록시
// 공공데이터포털 BldRgstHubService (Cloudflare IP 차단 우회용)

const DATA_KEY = 'adefbd03bd8c9c5fa02eb99fdf5407043904a1a2b4603f4852a341b62e7b123e';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sigunguCd, bjdongCd, bun } = req.query;
  if (!sigunguCd || !bjdongCd) {
    return res.status(400).json({ error: 'sigunguCd, bjdongCd 필요' });
  }

  try {
    const result = await queryBldRgstByDong(sigunguCd, bjdongCd, bun || '0000');
    if (result && !result._dbg) return res.status(200).json(result);
    return res.status(200).json({ error: 'no data', _dbg: result?._dbg, sigunguCd, bjdongCd });
  } catch(e) {
    return res.status(200).json({ error: e.message });
  }
}

async function queryBldRgstByDong(sg, bj, targetBun) {
  // 1단계: 법정동 전체 목록 조회
  const listUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrBasisOulnInfo`
    + `?serviceKey=${DATA_KEY}`
    + `&sigunguCd=${sg}&bjdongCd=${bj}`
    + `&numOfRows=100&pageNo=1&_type=json`;

  const listRes = await fetch(listUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const listText = await listRes.text();
  if (!listText || !listText.trim()) return { _dbg: 'empty response' };

  let listData;
  try { listData = JSON.parse(listText); }
  catch(e) { return { _dbg: 'parse fail', preview: listText.slice(0, 200) }; }

  const totalCount = listData?.response?.body?.totalCount;
  if (!totalCount || totalCount === 0) return { _dbg: 'no data' };

  const rawItems = listData?.response?.body?.items?.item;
  if (!rawItems) return { _dbg: 'no items' };
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];

  // 표제부(regstrKindCd=3) 우선 선택
  const titleList = list.filter(i => String(i.regstrKindCd) === '3');
  const pool = titleList.length > 0 ? titleList : list;

  // bun 매칭
  const bunInt = parseInt(targetBun || 0);
  let matched = null;
  if (bunInt > 0) {
    matched = pool.find(i => parseInt(i.bun || 0) === bunInt);
    if (!matched) matched = pool.find(i => Math.abs(parseInt(i.bun || 0) - bunInt) <= 5);
  }
  if (!matched) matched = pool[0];
  if (!matched) return { _dbg: 'no match' };

  // 2단계: 표제부 상세 조회
  const mgmPk = matched.mgmBldrgstPk;
  let detail = null;
  if (mgmPk && mgmPk !== '0') {
    const titleUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo`
      + `?serviceKey=${DATA_KEY}`
      + `&sigunguCd=${sg}&bjdongCd=${bj}`
      + `&mgmBldrgstPk=${encodeURIComponent(mgmPk)}`
      + `&numOfRows=1&pageNo=1&_type=json`;
    try {
      const tr = await fetch(titleUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (tr.ok) {
        const tt = await tr.text();
        if (tt && tt.trim()) {
          const td = JSON.parse(tt);
          const ti = td?.response?.body?.items?.item;
          detail = ti ? (Array.isArray(ti) ? ti[0] : ti) : null;
        }
      }
    } catch(e) {}
  }

  const src = detail || matched;
  return {
    source:        'BldRgst',
    _v:            'vercel-v1',
    _detail:       !!detail,
    useAprDay:     String(src.useAprDay     || ''),
    mainPurpsCdNm: String(src.mainPurpsCdNm || ''),
    grndFlrCnt:    parseInt(src.grndFlrCnt  || 0),
    ugrndFlrCnt:   parseInt(src.ugrndFlrCnt || 0),
    totArea:       parseFloat(src.totArea   || 0),
    platArea:      parseFloat(src.platArea  || 0),
    strctCdNm:     String(src.strctCdNm     || ''),
    roofCdNm:      String(src.roofCdNm      || ''),
    bldNm:         String(src.bldNm         || matched.bldNm || ''),
    mgmBldrgstPk:  mgmPk,
    totalCount
  };
}

