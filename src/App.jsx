import { useState, useRef } from "react";

const DEFAULT_FIELDS = [
  { id:"party_b_name",   label:"乙方名称（发货方）",   placeholder:"请输入乙方公司名称", value:"", section:"基本信息" },
  { id:"party_b_credit", label:"乙方统一社会信用代码", placeholder:"18位信用代码",       value:"", section:"基本信息" },
  { id:"party_b_address",label:"乙方地址",             placeholder:"详细地址",           value:"", section:"基本信息" },
  { id:"party_b_contact",label:"乙方联系人",           placeholder:"联系人姓名",         value:"", section:"基本信息" },
  { id:"party_b_phone",  label:"乙方电话",             placeholder:"联系电话",           value:"", section:"基本信息" },
  { id:"prepay_amount",  label:"预付款金额（元）",     placeholder:"例：3000",           value:"", section:"结算信息" },
  { id:"bank_name",      label:"乙方账户名称",         placeholder:"开户名",             value:"", section:"结算信息" },
  { id:"bank_branch",    label:"乙方开户行",           placeholder:"开户行名称",         value:"", section:"结算信息" },
  { id:"bank_account",   label:"乙方银行账号",         placeholder:"银行账号",           value:"", section:"结算信息" },
  { id:"sign_date_y",    label:"签署年份",             placeholder:"2024",               value:"", section:"签署信息" },
  { id:"sign_date_m",    label:"签署月份",             placeholder:"06",                 value:"", section:"签署信息" },
  { id:"sign_date_d",    label:"签署日期",             placeholder:"15",                 value:"", section:"签署信息" },
];

const EMPTY_ROW = () => ({
  brand:"", product:"", spec:"", unit:"",
  price:"", retail:"", package:"", invoice:"普票", tax_rate:"13"
});

const COLUMNS = [
  { key:"brand",    label:"品牌",         w:80  },
  { key:"product",  label:"产品名称",     w:130 },
  { key:"spec",     label:"规格",         w:110 },
  { key:"unit",     label:"销售单位",     w:75  },
  { key:"price",    label:"供货单价(元)", w:100 },
  { key:"retail",   label:"建议零售价",   w:90  },
  { key:"package",  label:"包装",         w:80  },
  { key:"invoice",  label:"税票类型",     w:90  },
  { key:"tax_rate", label:"税率(%)",      w:65  },
];

const INVOICE_OPTIONS = ["普票","专票"];

// ── 发票归一化 ──
function normalizeInvoice(raw) {
  if (!raw) return "普票";
  if (raw.includes("专")) return "专票";
  return "普票";
}

// ── 产品行解析 ──
function parseProductLines(text) {
  const KWS = ["增值税专用发票","增值税普通发票","普通发票","专用发票","普票","专票"];
  return text.trim().split("\n").map(l=>l.trim()).filter(Boolean).map(line=>{
    let norm = line;
    KWS.forEach(kw=>{
      norm = norm.replace(new RegExp(kw.split("").join("\\s*"),"g"), kw);
    });
    let tokens = norm.split(/\t|\s{2,}/).map(t=>t.trim()).filter(Boolean);
    if (tokens.length < 4) tokens = norm.split(/\s+/).map(t=>t.trim()).filter(Boolean);

    let invoiceVal="", invoiceIdx=-1;
    for (let i=0;i<tokens.length;i++) {
      const kw=KWS.find(k=>tokens[i]===k);
      if(kw){invoiceVal=kw;invoiceIdx=i;break;}
    }
    if(invoiceIdx>=0) tokens.splice(invoiceIdx,1);

    let taxRate="";
    const last=tokens[tokens.length-1];
    if(last&&/^\d+(\.\d+)?%?$/.test(last)){taxRate=last.replace("%","");tokens=tokens.slice(0,-1);}

    const [brand="",product="",spec="",unit="",price="",retail="",pkg=""] = tokens;
    return {
      brand:brand.trim(), product:product.trim(), spec:spec.trim(), unit:unit.trim(),
      price:price.trim(), retail:retail.trim(), package:pkg.trim(),
      invoice:normalizeInvoice(invoiceVal), tax_rate:taxRate||"13",
    };
  }).filter(r=>r.brand||r.product);
}

// ── 结算信息解析：从一段文字自动提取字段 ──
// 支持格式举例：
// 名称：XX公司  开户行：XX银行  账号：1234567890
// 或每行一个字段，或空格/换行混排
function parseSettlement(text) {
  const result = {};
  const patterns = [
    { keys:["名称","账户名称","户名","公司名"],  field:"bank_name"    },
    { keys:["开户行","开户银行","银行"],          field:"bank_branch"  },
    { keys:["账号","银行账号","账户号"],          field:"bank_account" },
    { keys:["预付款","金额","预付"],              field:"prepay_amount"},
  ];
  // 统一分隔符后按模式匹配
  const normalized = text.replace(/[：:]\s*/g,"：").replace(/\s+/g," ");
  patterns.forEach(({keys,field})=>{
    for(const key of keys){
      const re = new RegExp(`${key}[：:]([^，,；;\n　 ]+)`,"i");
      const m = normalized.match(re);
      if(m){result[field]=m[1].trim();break;}
    }
  });
  return result;
}

// ── 主题（浅色蓝色系） ──
const T = {
  bg:"#f0f4fb", surface:"#ffffff", high:"#e8eef8", sidebar:"#f5f8ff",
  border:"#d0daf0", borderL:"#e2eaf8",
  accent:"#2563eb", accentL:"#3b82f6",
  accentBg:"rgba(37,99,235,0.08)", accentBg2:"rgba(37,99,235,0.14)",
  text:"#1e293b", textMd:"#475569", textMuted:"#94a3b8", textDim:"#cbd5e1",
  ok:"#059669", okBg:"rgba(5,150,105,0.1)",
  warn:"#d97706", warnBg:"rgba(217,119,6,0.1)",
  err:"#dc2626",
  shadow:"0 1px 3px rgba(0,0,0,0.08)",
  shadowMd:"0 4px 16px rgba(37,99,235,0.10)",
};

const SECTIONS = ["基本信息","结算信息","签署信息"];

export default function App() {
  const [step, setStep]         = useState(1);
  const [fields, setFields]     = useState(DEFAULT_FIELDS);
  const [rows, setRows]         = useState([EMPTY_ROW()]);
  const [activeSec, setActiveSec] = useState("基本信息");
  const [tplName, setTplName]   = useState("代发合同模板最新版-5_15.docx");
  const [notif, setNotif]       = useState(null);

  // 产品清单粘贴
  const [pasteText, setPasteText]   = useState("");
  const [preview, setPreview]       = useState(null);
  const [pasteOpen, setPasteOpen]   = useState(true);
  const [pasteErr, setPasteErr]     = useState("");
  const [editCell, setEditCell]     = useState(null);

  // 结算信息粘贴
  const [settlePaste, setSettlePaste]   = useState("");
  const [settleOpen, setSettleOpen]     = useState(false);
  const [settlePreview, setSettlePreview] = useState(null);
  const [settleErr, setSettleErr]       = useState("");

  const fileRef = useRef();

  const notify = (msg,type="success") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),3000); };

  const setField = (id,v) => setFields(p=>p.map(f=>f.id===id?{...f,value:v}:f));
  const setCell  = (r,k,v)=> setRows(p=>{const n=[...p];n[r]={...n[r],[k]:v};return n;});
  const addRow   = ()      => setRows(p=>[...p,EMPTY_ROW()]);
  const delRow   = i       => setRows(p=>p.length>1?p.filter((_,j)=>j!==i):p);
  const fv       = id      => fields.find(f=>f.id===id)?.value||"";

  const filled = fields.filter(f=>f.value).length;
  const prog   = Math.round(filled/fields.length*100);

  // 产品解析
  const doParse = () => {
    if(!pasteText.trim()){setPasteErr("请粘贴商品文本");return;}
    const r=parseProductLines(pasteText);
    if(!r.length){setPasteErr("未能识别有效数据，请检查格式");return;}
    setPreview(r); setPasteErr("");
  };
  const doApply = () => {
    if(!preview) return;
    setRows(preview); setPreview(null); setPasteText(""); setPasteOpen(false);
    notify(`成功导入 ${preview.length} 行商品数据`);
  };

  // 结算信息解析
  const doSettleParse = () => {
    if(!settlePaste.trim()){setSettleErr("请粘贴结算信息文本");return;}
    const r=parseSettlement(settlePaste);
    if(!Object.keys(r).length){setSettleErr("未能识别字段，请确认包含名称/开户行/账号等关键词");return;}
    setSettlePreview(r); setSettleErr("");
  };
  const doSettleApply = () => {
    if(!settlePreview) return;
    Object.entries(settlePreview).forEach(([id,v])=>setField(id,v));
    setSettlePreview(null); setSettlePaste(""); setSettleOpen(false);
    notify("结算信息已自动填充");
  };

  const exportTxt = () => {
    const lines = [
      "代发货合同","",
      `乙方：${fv("party_b_name")}`,`信用代码：${fv("party_b_credit")}`,
      `地址：${fv("party_b_address")}`,`联系人：${fv("party_b_contact")}  电话：${fv("party_b_phone")}`,
      `预付款：${fv("prepay_amount")}元`,`账户：${fv("bank_name")} / ${fv("bank_branch")} / ${fv("bank_account")}`,
      `日期：${fv("sign_date_y")}年${fv("sign_date_m")}月${fv("sign_date_d")}日`,
      "","【产品采购清单】",COLUMNS.map(c=>c.label).join("\t"),
      ...rows.map(r=>COLUMNS.map(c=>r[c.key]).join("\t")),
    ];
    const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="合同_已填充.txt";a.click();
    notify("TXT 导出成功");
  };

  const hl = v=>({
    background:v?T.okBg:T.warnBg, color:v?T.ok:T.warn,
    padding:"1px 6px", borderRadius:"4px",
    borderBottom:`1.5px ${v?"solid":"dashed"} currentColor`, fontWeight:v?"600":"400",
  });

  const inputStyle = v=>({
    width:"100%",padding:"9px 12px",borderRadius:"8px",
    border:`1.5px solid ${v?T.accent+"80":T.border}`,
    background:v?T.accentBg:T.surface,
    color:T.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"system-ui",transition:"all .18s",
  });

  // 结算信息字段标签映射
  const SETTLE_LABELS = {
    bank_name:"乙方账户名称", bank_branch:"乙方开户行",
    bank_account:"乙方银行账号", prepay_amount:"预付款金额",
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'Noto Serif SC',Georgia,serif",display:"flex",flexDirection:"column"}}>

      {/* Header */}
      <header style={{borderBottom:`1px solid ${T.border}`,padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:"60px",background:T.surface,boxShadow:T.shadow,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${T.accent},${T.accentL})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📄</div>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:T.text}}>合同智能填充工具</div>
            <div style={{fontSize:10,color:T.textMuted,fontFamily:"monospace"}}>Contract Auto-Fill System</div>
          </div>
        </div>
        <div style={{display:"flex",gap:2,background:T.high,borderRadius:8,padding:"3px"}}>
          {[["1","填写信息"],["2","预览合同"],["3","差异对比"]].map(([n,lb])=>(
            <button key={n} onClick={()=>setStep(+n)} style={{padding:"5px 16px",borderRadius:6,cursor:"pointer",fontSize:12,border:"none",background:step===+n?T.surface:"transparent",color:step===+n?T.accent:T.textMuted,fontWeight:step===+n?700:400,boxShadow:step===+n?T.shadow:"none",transition:"all .15s"}}>{n}. {lb}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <BtnX label="TXT" onClick={exportTxt} variant="ghost"/>
          <BtnX label="Word" onClick={()=>notify("Word导出需接入后端","warning")} variant="outline"/>
          <BtnX label="PDF"  onClick={()=>notify("PDF导出需接入后端","warning")}  variant="primary"/>
        </div>
      </header>

      {notif&&<div style={{position:"fixed",top:68,right:20,zIndex:999,padding:"9px 18px",borderRadius:8,fontSize:13,fontWeight:600,background:notif.type==="success"?T.ok:notif.type==="warning"?T.warn:T.err,color:"#fff",boxShadow:"0 4px 20px rgba(0,0,0,0.15)",animation:"fadeSlide .2s ease"}}>{notif.msg}</div>}

      {/* ═══ STEP 1 ═══ */}
      {step===1&&(
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>

          {/* Sidebar */}
          <div style={{width:220,flexShrink:0,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column"}}>
            <div style={{padding:"16px 14px",borderBottom:`1px solid ${T.borderL}`}}>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:7,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"system-ui"}}>当前模板</div>
              <div style={{fontSize:11,color:T.textMd,background:T.surface,padding:"9px 10px",borderRadius:7,wordBreak:"break-all",lineHeight:1.6,marginBottom:9,border:`1px solid ${T.border}`,boxShadow:T.shadow}}>📄 {tplName}</div>
              <input ref={fileRef} type="file" accept=".docx" style={{display:"none"}} onChange={e=>{if(e.target.files[0]){setTplName(e.target.files[0].name);notify("模板上传成功");}}}/>
              <button onClick={()=>fileRef.current.click()} style={{width:"100%",padding:"7px",borderRadius:6,border:`1.5px dashed ${T.border}`,background:"transparent",color:T.textMuted,cursor:"pointer",fontSize:11,fontFamily:"system-ui"}}>+ 更换合同模板</button>
            </div>
            <div style={{padding:"14px",borderBottom:`1px solid ${T.borderL}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:10,color:T.textMuted,fontFamily:"system-ui"}}>填写进度</span>
                <span style={{fontSize:10,color:T.accent,fontWeight:700,fontFamily:"system-ui"}}>{filled}/{fields.length}</span>
              </div>
              <div style={{height:5,background:T.borderL,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${prog}%`,background:`linear-gradient(90deg,${T.accent},${T.accentL})`,borderRadius:3,transition:"width .3s"}}/>
              </div>
              <div style={{fontSize:10,color:T.textMuted,marginTop:4,fontFamily:"system-ui"}}>{prog}% 已完成</div>
            </div>
            <div style={{padding:"10px 8px",flex:1}}>
              {[...SECTIONS,"产品清单"].map(sec=>{
                const isProduct = sec==="产品清单";
                const cnt = isProduct?null:fields.filter(f=>f.section===sec&&f.value).length;
                const tot = isProduct?null:fields.filter(f=>f.section===sec).length;
                const on  = activeSec===sec;
                return(
                  <button key={sec} onClick={()=>setActiveSec(sec)} style={{width:"100%",padding:"9px 12px",borderRadius:7,border:"none",background:on?T.surface:"transparent",color:on?T.accent:T.textMd,cursor:"pointer",fontSize:13,textAlign:"left",marginBottom:2,display:"flex",justifyContent:"space-between",alignItems:"center",borderLeft:`2.5px solid ${on?T.accent:"transparent"}`,fontWeight:on?600:400,boxShadow:on?T.shadow:"none",transition:"all .15s"}}>
                    <span>{sec}</span>
                    {isProduct
                      ? <STag>{rows.filter(r=>r.brand||r.product).length}行</STag>
                      : <STag ok={cnt===tot}>{cnt}/{tot}</STag>
                    }
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main */}
          <div style={{flex:1,overflow:"auto",padding:36}}>
            {activeSec!=="产品清单"?(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
                  <div>
                    <h2 style={{fontSize:20,fontWeight:700,margin:"0 0 4px",color:T.text}}>{activeSec}</h2>
                    <p style={{fontSize:12,color:T.textMuted,margin:0,fontFamily:"system-ui"}}>填写合同中需要自动替换的信息</p>
                  </div>
                  {/* 结算信息：显示粘贴按钮 */}
                  {activeSec==="结算信息"&&(
                    <BtnX label={settleOpen?"▲ 收起":"📋 粘贴文本自动填充"} onClick={()=>{setSettleOpen(!settleOpen);setSettlePreview(null);}} variant={settleOpen?"outline":"ghost"}/>
                  )}
                </div>

                {/* 结算信息粘贴区 */}
                {activeSec==="结算信息"&&settleOpen&&(
                  <div style={{marginBottom:24,animation:"fadeIn .2s ease"}}>
                    <div style={{padding:"16px 18px",borderRadius:10,border:`1.5px solid ${settlePreview?"#059669":T.border}`,background:settlePreview?"rgba(5,150,105,0.04)":T.sidebar,boxShadow:T.shadow}}>
                      <div style={{fontSize:12,color:T.textMd,marginBottom:9,fontFamily:"system-ui",fontWeight:600}}>
                        📋 粘贴结算信息文本，自动识别账户名称、开户行、账号、预付款金额
                      </div>
                      <div style={{fontSize:11,color:T.textMuted,marginBottom:10,fontFamily:"system-ui",lineHeight:1.7}}>
                        支持格式举例：<br/>
                        <code style={{background:T.high,padding:"2px 6px",borderRadius:4,fontSize:11}}>名称：XX公司  开户行：XX银行  账号：1234567890  预付款：5000</code>
                      </div>
                      <textarea
                        value={settlePaste}
                        onChange={e=>{setSettlePaste(e.target.value);setSettlePreview(null);setSettleErr("");}}
                        placeholder={"名称：南京某某科技有限公司\n开户行：中国工商银行南京分行\n账号：1234567890123456789\n预付款：5000"}
                        rows={4}
                        style={{width:"100%",borderRadius:8,padding:"10px 12px",border:`1.5px solid ${settleErr?"#dc2626":T.border}`,background:"#fff",color:T.text,fontSize:12,fontFamily:"monospace",resize:"vertical",outline:"none",boxSizing:"border-box",lineHeight:1.7,boxShadow:"inset 0 1px 2px rgba(0,0,0,0.04)"}}
                      />
                      {settleErr&&<div style={{fontSize:11,color:T.err,marginTop:5,fontFamily:"system-ui"}}>⚠ {settleErr}</div>}

                      {/* 解析预览 */}
                      {settlePreview&&(
                        <div style={{marginTop:12,padding:"12px 14px",borderRadius:8,background:T.okBg,border:`1px solid ${T.ok}40`}}>
                          <div style={{fontSize:11,color:T.ok,fontWeight:700,marginBottom:8,fontFamily:"system-ui"}}>✨ 识别结果预览</div>
                          {Object.entries(settlePreview).map(([id,v])=>(
                            <div key={id} style={{display:"flex",gap:8,marginBottom:4,fontFamily:"system-ui",fontSize:12}}>
                              <span style={{color:T.textMuted,minWidth:100}}>{SETTLE_LABELS[id]||id}：</span>
                              <span style={{color:T.ok,fontWeight:600}}>{v}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{display:"flex",gap:10,marginTop:12,flexWrap:"wrap"}}>
                        <BtnX label="🔍 解析识别" onClick={doSettleParse} variant="primary"/>
                        {settlePreview&&<BtnX label="✅ 确认填入" onClick={doSettleApply} variant="success"/>}
                        {settlePaste&&<BtnX label="清空" onClick={()=>{setSettlePaste("");setSettlePreview(null);setSettleErr("");}} variant="ghost"/>}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                  {fields.filter(f=>f.section===activeSec).map(f=>(
                    <div key={f.id}>
                      <label style={{display:"block",fontSize:12,color:T.textMd,marginBottom:6,fontFamily:"system-ui",fontWeight:500}}>{f.label}</label>
                      <input value={f.value} onChange={e=>setField(f.id,e.target.value)}
                        placeholder={f.placeholder} style={inputStyle(f.value)}
                        onFocus={e=>{e.target.style.borderColor=T.accent;e.target.style.boxShadow=`0 0 0 3px ${T.accentBg}`;}}
                        onBlur={e=>{e.target.style.borderColor=f.value?T.accent+"80":T.border;e.target.style.boxShadow="none";}}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ):(
              <ProductSection
                rows={rows} pasteText={pasteText} setPasteText={setPasteText}
                preview={preview} setPreview={setPreview}
                pasteOpen={pasteOpen} setPasteOpen={setPasteOpen}
                pasteErr={pasteErr} setPasteErr={setPasteErr}
                editCell={editCell} setEditCell={setEditCell}
                doParse={doParse} doApply={doApply}
                addRow={addRow} delRow={delRow} setCell={setCell}
              />
            )}
          </div>
        </div>
      )}

      {/* ═══ STEP 2 ═══ */}
      {step===2&&(
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <div style={{flex:1,overflow:"auto",padding:40,background:"#e8edf5"}}>
            <div style={{maxWidth:780,margin:"0 auto",background:"#fff",padding:"60px 68px",boxShadow:"0 4px 32px rgba(37,99,235,0.10)",fontFamily:"'Noto Serif SC',serif",color:"#1a1a1a",lineHeight:2,fontSize:13.5,borderRadius:4}}>
              <h1 style={{textAlign:"center",fontSize:21,fontWeight:700,letterSpacing:"0.18em",marginBottom:36}}>代发货合同</h1>
              <p style={{margin:"3px 0"}}><strong>甲方(结算方)：</strong>南京大当佳科技有限公司</p>
              <p style={{margin:"3px 0"}}><strong>统一社会信用代码：</strong>91320115MA27K4NL5F</p>
              <p style={{margin:"3px 0"}}><strong>地址：</strong>南京市江宁区东吉大道1号(江宁开发区)</p>
              <p style={{margin:"3px 0"}}><strong>联系人：</strong>杨修成&nbsp;&nbsp;<strong>电话：</strong>18512518626</p>
              <div style={{height:14}}/>
              {[["乙方(发货方)：","party_b_name","【乙方名称】"],["统一社会信用代码：","party_b_credit","【统一社会信用代码】"],["地址：","party_b_address","【地址】"]].map(([lb,id,ph])=>(
                <p key={id} style={{margin:"3px 0"}}><strong>{lb}</strong><span style={hl(fv(id))}>{fv(id)||ph}</span></p>
              ))}
              <p style={{margin:"3px 0"}}><strong>联系人：</strong><span style={hl(fv("party_b_contact"))}>{fv("party_b_contact")||"【联系人】"}</span>&nbsp;&nbsp;<strong>电话：</strong><span style={hl(fv("party_b_phone"))}>{fv("party_b_phone")||"【电话】"}</span></p>
              <div style={{height:14}}/>
              <p><strong>合同签订地：</strong>江苏省南京市江宁区</p>
              <div style={{height:18}}/>
              <p style={{fontWeight:700}}>第三条 结算方式</p>
              <p>预付款：<span style={hl(fv("prepay_amount"))}>{fv("prepay_amount")||"【金额】"}</span>元</p>
              <div style={{height:14}}/>
              <p style={{fontWeight:700}}>4、乙方账户信息</p>
              {[["名称：","bank_name","【账户名称】"],["开户行：","bank_branch","【开户行】"],["账号：","bank_account","【银行账号】"]].map(([lb,id,ph])=>(
                <p key={id} style={{margin:"3px 0"}}>{lb}<span style={hl(fv(id))}>{fv(id)||ph}</span></p>
              ))}
              <p style={{textAlign:"center",color:"#bbb",margin:"26px 0",fontSize:11}}>··· 第四条至第十条标准条款（内容不变）···</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:40,marginTop:32}}>
                {["甲方","乙方"].map(p=>(
                  <div key={p}>
                    <p><strong>{p}(盖章)：</strong></p>
                    <p>法定代表人签字：_______________</p>
                    <p>日期：<span style={hl(fv("sign_date_y"))}>{fv("sign_date_y")||"____"}年{fv("sign_date_m")||"__"}月{fv("sign_date_d")||"__"}日</span></p>
                  </div>
                ))}
              </div>
              <div style={{marginTop:46,borderTop:"1px solid #e0e0e0",paddingTop:30}}>
                <h3 style={{textAlign:"center",fontWeight:700,marginBottom:18,fontSize:13}}>附件一：《产品采购清单》</h3>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{background:"#f0f4fb"}}>{COLUMNS.map(c=><th key={c.key} style={{padding:"8px 6px",border:"1px solid #d0daf0",textAlign:"center",fontWeight:700,color:"#2563eb"}}>{c.label}</th>)}</tr></thead>
                  <tbody>{rows.map((row,i)=>(
                    <tr key={i} style={{background:i%2?"#f8fafd":"#fff"}}>
                      {COLUMNS.map(c=><td key={c.key} style={{padding:"7px 6px",border:"1px solid #e2eaf8",textAlign:"center",background:row[c.key]?"#f0fdf4":"#fffbeb",color:row[c.key]?"#065f46":"#92400e",fontSize:11}}>{row[c.key]||"—"}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
          <div style={{width:255,flexShrink:0,borderLeft:`1px solid ${T.border}`,background:T.sidebar,overflow:"auto",padding:"18px 14px"}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:14,color:T.text}}>快速编辑</div>
            {fields.map(f=>(
              <div key={f.id} style={{marginBottom:9}}>
                <label style={{display:"block",fontSize:10,color:T.textMuted,marginBottom:3,fontFamily:"system-ui"}}>{f.label}</label>
                <input value={f.value} onChange={e=>setField(f.id,e.target.value)} placeholder={f.placeholder}
                  style={{width:"100%",padding:"6px 9px",borderRadius:6,border:`1.5px solid ${f.value?T.accent+"80":T.border}`,background:f.value?T.accentBg:T.surface,color:T.text,fontSize:11,outline:"none",boxSizing:"border-box",fontFamily:"system-ui"}}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ STEP 3 ═══ */}
      {step===3&&(
        <div style={{flex:1,overflow:"auto",padding:32}}>
          <h2 style={{fontSize:19,fontWeight:700,margin:"0 0 5px",color:T.text}}>合同差异对比</h2>
          <p style={{fontSize:12,color:T.textMuted,margin:"0 0 24px",fontFamily:"system-ui"}}>橙色底 = 原始占位符 · 绿色底 = 已填充内容</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            {[true,false].map(orig=>(
              <div key={String(orig)} style={{borderRadius:10,overflow:"hidden",boxShadow:T.shadowMd,border:`1px solid ${T.border}`}}>
                <div style={{padding:"10px 16px",background:orig?"#fffbeb":T.accentBg,fontSize:13,fontWeight:700,fontFamily:"system-ui",borderBottom:`2px solid ${orig?T.warn:T.accent}`,color:orig?T.warn:T.accent}}>
                  {orig?"📄 原始模板":"✅ 填充后内容"}
                </div>
                <div style={{padding:"18px 20px",background:T.surface,fontSize:12,lineHeight:2.2,fontFamily:"system-ui"}}>
                  {[["乙方：","party_b_name","【乙方名称】"],["信用代码：","party_b_credit","【统一社会信用代码】"],["地址：","party_b_address","【地址】"],["联系人：","party_b_contact","【联系人】"],["电话：","party_b_phone","【电话】"],["预付款：","prepay_amount","【金额】"],["账户名：","bank_name","【账户名称】"],["开户行：","bank_branch","【开户行】"],["银行账号：","bank_account","【银行账号】"]].map(([lb,id,ph])=>{
                    const v=fv(id);
                    return(<p key={id} style={{margin:"2px 0"}}><span style={{color:T.textMuted}}>{lb}</span><span style={{background:orig?T.warnBg:v?T.okBg:T.warnBg,color:orig?T.warn:v?T.ok:T.warn,padding:"0 6px",borderRadius:4,borderBottom:`1.5px ${(orig||!v)?"dashed":"solid"} currentColor`,marginLeft:4}}>{orig?ph:(v||ph)}</span></p>);
                  })}
                  <div style={{marginTop:12,padding:"9px 11px",background:orig?T.warnBg:T.accentBg,borderRadius:6,fontSize:11,color:orig?T.warn:T.accent}}>
                    {orig?"附件表格：所有字段为空":`附件表格：${rows.filter(r=>r.brand||r.product).length} 行 × ${COLUMNS.length} 列`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop:18,padding:"16px 22px",background:T.surface,borderRadius:10,border:`1px solid ${T.border}`,fontFamily:"system-ui",display:"flex",gap:36,boxShadow:T.shadow}}>
            {[{n:fields.filter(f=>f.value).length,lb:"已填充字段",c:T.ok},{n:fields.filter(f=>!f.value).length,lb:"待填充字段",c:T.warn},{n:rows.filter(r=>r.brand||r.product).length,lb:"产品行数",c:T.accent}].map(({n,lb,c})=>(
              <div key={lb}><div style={{fontSize:28,fontWeight:700,color:c}}>{n}</div><div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{lb}</div></div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#c7d4ee;border-radius:3px;}
        input::placeholder,textarea::placeholder{color:#94a3b8;}
        @keyframes fadeSlide{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </div>
  );
}

// ─── 产品清单子组件 ───
function ProductSection({rows,pasteText,setPasteText,preview,setPreview,pasteOpen,setPasteOpen,pasteErr,setPasteErr,editCell,setEditCell,doParse,doApply,addRow,delRow,setCell}) {
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:22}}>
        <div>
          <h2 style={{fontSize:19,fontWeight:700,margin:"0 0 4px",color:"#1e293b"}}>产品采购清单</h2>
          <p style={{fontSize:12,color:"#94a3b8",margin:0,fontFamily:"system-ui"}}>粘贴文本自动识别，或直接在表格中手动填写</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <BtnX label={pasteOpen?"▲ 收起":"▼ 粘贴文本导入"} onClick={()=>{setPasteOpen(!pasteOpen);setPreview(null);}} variant={pasteOpen?"outline":"ghost"}/>
          <BtnX label="+ 新增行" onClick={addRow} variant="ghost"/>
        </div>
      </div>

      {pasteOpen&&(
        <div style={{marginBottom:22,animation:"fadeIn .2s ease"}}>
          <div style={{padding:"16px 18px",borderRadius:10,border:`1.5px solid ${preview?"#059669":"#d0daf0"}`,background:preview?"rgba(5,150,105,0.04)":"#f5f8ff",boxShadow:"0 1px 4px rgba(37,99,235,0.06)"}}>
            <div style={{fontSize:12,color:"#475569",marginBottom:10,fontFamily:"system-ui",fontWeight:600}}>📋 粘贴商品文本（每行一个商品，字段间空格分隔）</div>
            <textarea value={pasteText} onChange={e=>{setPasteText(e.target.value);setPreview(null);setPasteErr("");}}
              placeholder={"联想 笔记本电脑 ThinkPad X1 台 8500 10999 彩盒 专票 13\n罗技 无线鼠标 M720 个 180 299 吸塑 普票 13\n樱桃 机械键盘 MX3.0S 个 650 899 彩盒 增值税专用发票 13"}
              rows={5} style={{width:"100%",borderRadius:8,padding:"11px 13px",border:`1.5px solid ${pasteErr?"#dc2626":"#d0daf0"}`,background:"#fff",color:"#1e293b",fontSize:12,fontFamily:"monospace",resize:"vertical",outline:"none",boxSizing:"border-box",lineHeight:1.7}}/>
            {pasteErr&&<div style={{fontSize:11,color:"#dc2626",marginTop:5,fontFamily:"system-ui"}}>⚠ {pasteErr}</div>}
            <div style={{display:"flex",gap:10,marginTop:12,flexWrap:"wrap"}}>
              <BtnX label="🔍 解析预览" onClick={doParse} variant="primary"/>
              {preview&&<BtnX label={`✅ 确认导入 ${preview.length} 行`} onClick={doApply} variant="success"/>}
              {pasteText&&<BtnX label="清空" onClick={()=>{setPasteText("");setPreview(null);setPasteErr("");}} variant="ghost"/>}
            </div>
          </div>
          {preview&&(
            <div style={{marginTop:14,animation:"fadeIn .2s ease"}}>
              <div style={{fontSize:12,color:"#059669",marginBottom:10,fontFamily:"system-ui",fontWeight:600}}>✨ 解析结果预览（共 {preview.length} 行）—— 确认无误后点「确认导入」</div>
              <div style={{overflowX:"auto",borderRadius:8,border:"1px solid #d0daf0",background:"#fff",boxShadow:"0 1px 4px rgba(37,99,235,0.06)"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"system-ui"}}>
                  <thead><tr style={{background:"#f0f4fb"}}>{COLUMNS.map(c=><th key={c.key} style={{padding:"8px 9px",color:"#2563eb",fontSize:10,fontWeight:700,borderBottom:"2px solid #d0daf0",textAlign:"left",whiteSpace:"nowrap"}}>{c.label}</th>)}</tr></thead>
                  <tbody>{preview.map((r,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #e2eaf8",background:i%2?"#f8fafd":"#fff"}}>
                      {COLUMNS.map(c=><td key={c.key} style={{padding:"7px 9px",color:r[c.key]?"#1e293b":"#94a3b8",fontSize:11}}>{r[c.key]||<span style={{color:"#cbd5e1",fontSize:10}}>—</span>}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #d0daf0",background:"#fff",boxShadow:"0 1px 4px rgba(37,99,235,0.06)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:"system-ui"}}>
          <thead>
            <tr style={{background:"#f0f4fb"}}>
              <th style={{padding:"9px 8px",color:"#94a3b8",fontSize:10,fontWeight:700,borderBottom:"2px solid #d0daf0",width:28,textAlign:"center"}}>#</th>
              {COLUMNS.map(c=><th key={c.key} style={{padding:"9px 8px",color:"#2563eb",fontSize:10,fontWeight:700,borderBottom:"2px solid #d0daf0",textAlign:"left",whiteSpace:"nowrap",minWidth:c.w}}>{c.label}</th>)}
              <th style={{padding:"9px 8px",background:"#f0f4fb",borderBottom:"2px solid #d0daf0",width:32}}/>
            </tr>
          </thead>
          <tbody>
            {rows.map((row,ri)=>(
              <tr key={ri} style={{borderBottom:"1px solid #e2eaf8",background:ri%2?"#f8fafd":"#fff"}}>
                <td style={{padding:"4px 8px",textAlign:"center",color:"#94a3b8",fontSize:10}}>{ri+1}</td>
                {COLUMNS.map(c=>(
                  <td key={c.key} style={{padding:"3px 5px"}}>
                    {c.key==="invoice"?(
                      <select value={row[c.key]} onChange={e=>setCell(ri,c.key,e.target.value)}
                        style={{width:"100%",padding:"6px 7px",borderRadius:5,border:`1.5px solid ${editCell===`${ri}-${c.key}`?"#2563eb":"#d0daf0"}`,background:row[c.key]==="专票"?"rgba(37,99,235,0.07)":"#fff",color:"#1e293b",fontSize:11,outline:"none",cursor:"pointer",fontFamily:"system-ui"}}>
                        {INVOICE_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    ):(
                      <input value={row[c.key]} onChange={e=>setCell(ri,c.key,e.target.value)}
                        onFocus={()=>setEditCell(`${ri}-${c.key}`)} onBlur={()=>setEditCell(null)}
                        style={{width:"100%",padding:"6px 8px",borderRadius:5,border:`1.5px solid ${editCell===`${ri}-${c.key}`?"#2563eb":row[c.key]?"#93c5fd":"#d0daf0"}`,background:row[c.key]?"rgba(37,99,235,0.06)":"#fff",color:"#1e293b",fontSize:11,outline:"none",boxSizing:"border-box",minWidth:c.w-18,transition:"border .12s"}}/>
                    )}
                  </td>
                ))}
                <td style={{padding:"3px 5px",textAlign:"center"}}>
                  <button onClick={()=>delRow(ri)} style={{width:26,height:26,borderRadius:5,border:"1px solid #e2eaf8",background:"transparent",color:"#dc2626",cursor:"pointer",fontSize:14}}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 修正后的底部提示 ── */}
      <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:"rgba(37,99,235,0.05)",border:"1px solid rgba(37,99,235,0.15)",fontSize:11,color:"#3b82f6",fontFamily:"system-ui"}}>
        💡 税票类型下拉选择「普票」或「专票」；粘贴文字时，"增值税专用发票"自动归为专票，其余归为普票。
      </div>
    </div>
  );
}

function BtnX({label,onClick,variant="ghost"}) {
  const s = {
    primary:{border:"none",background:"linear-gradient(135deg,#2563eb,#3b82f6)",color:"#fff",fontWeight:700,boxShadow:"0 2px 8px rgba(37,99,235,0.25)"},
    success:{border:"none",background:"linear-gradient(135deg,#059669,#10b981)",color:"#fff",fontWeight:700,boxShadow:"0 2px 8px rgba(5,150,105,0.25)"},
    outline:{border:"1.5px solid #2563eb",background:"rgba(37,99,235,0.08)",color:"#2563eb",fontWeight:600},
    ghost:  {border:"1px solid #d0daf0",background:"#fff",color:"#475569",fontWeight:400,boxShadow:"0 1px 2px rgba(0,0,0,0.05)"},
  };
  return <button onClick={onClick} style={{padding:"7px 14px",borderRadius:7,cursor:"pointer",fontSize:12,fontFamily:"system-ui",transition:"all .15s",...s[variant]}}>{label}</button>;
}

function STag({children,ok}) {
  return <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:ok?"rgba(5,150,105,0.12)":"rgba(148,163,184,0.15)",color:ok?"#059669":"#94a3b8",fontFamily:"system-ui"}}>{children}</span>;
}
