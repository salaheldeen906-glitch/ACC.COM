/* Local preview adapter. Business engine reused unchanged from accounting prototype.
   Example rates are explicit scenario input, never statutory defaults. */
(function(root){
'use strict';
const E=typeof module!=='undefined'&&module.exports?require('./engine.js'):root.Accounting;
const clone=x=>JSON.parse(JSON.stringify(x));
function chart(){
 if(root.ACCOUNT_SEED)return clone(root.ACCOUNT_SEED);
 if(typeof require!=='undefined'){const vm=require('vm'),fs=require('fs'),c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/schema.js','utf8'),c);return clone(c.window.ACCOUNT_SEED);}
 return [];
}
function transactional(s,fn){const w=clone(s),out=fn(w);Object.assign(s,w);return out?.id?s.docs.find(x=>x.id===out.id)||out:out;}
function stockLink(s,d){
 if(!['stockin','stockout'].includes(d.type)||!d.source)return;
 const inv=s.docs.find(x=>x.id===d.source);if(!inv)throw Error('مستند مصدر الحركة غير موجود');
 if(inv.status!=='posted'||inv.type!==(d.type==='stockin'?'purchase':'sales')||!inv.invoiceLines)throw Error('اربط الحركة بفاتورة تفصيلية مرحّلة في الاتجاه الصحيح');
 const itemLines=inv.invoiceLines.filter(l=>l.item===d.item);
 const eligible=itemLines.filter(l=>d.sourceLine?l.id===d.sourceLine:true);
 if(!eligible.length)throw Error('الصنف غير موجود في بنود فاتورة المصدر');
 if(itemLines.length>1&&!d.sourceLine)throw Error('حدد بند الفاتورة لأن الصنف مكرر في أكثر من بند');
 const previous=E.posted(s,d.type).filter(x=>x.id!==d.id&&x.source===d.source&&x.item===d.item);
 const itemQty=itemLines.reduce((n,l)=>n+Number(l.qty),0);
 const totalPrevious=previous.reduce((n,x)=>n+Number(x.qty),0);
 if(totalPrevious+Number(d.qty)>itemQty)throw Error('الكمية تتجاوز كمية الصنف في الفاتورة بعد الحركات السابقة');
 const lineQty=eligible.reduce((n,l)=>n+Number(l.qty),0);
 const already=previous.filter(x=>!d.sourceLine||x.sourceLine===d.sourceLine||!x.sourceLine).reduce((n,x)=>n+Number(x.qty),0);
 if(already+Number(d.qty)>lineQty)throw Error('الكمية تتجاوز كمية بند الفاتورة بعد الحركات السابقة');
 if(d.date<inv.date)throw Error('حركة المخزن لا تسبق فاتورة المصدر في المعاينة');
}
function saveDraft(s,data,actor='owner'){return transactional(s,w=>E.create(w,data,actor));}
function lifecycle(s,id,target,actor='owner'){
 return transactional(s,w=>{const d=E.find(w,id);if(target==='posted')stockLink(w,d);return E.transition(w,id,target,actor);});
}
function post(s,data,actor='owner'){
 return transactional(s,w=>{const d=E.create(w,data,actor);stockLink(w,d);for(const target of ['review','approved','posted'])E.transition(w,d.id,target,actor);return d;});
}
function line(id,description,unitPrice,extra={}){return {id,description,category:'خدمة',qty:1,unitPrice,discount:0,treatment:'expense',account:'621000',vatMode:'standard',vatRate:14,whtRate:3,deductible:true,...extra};}
function invoice(id,type,description,lines,extra={}){return {id,type,date:'2026-09-03',due:'2026-10-03',description,party:type==='purchase'?'V001':'C001',reference:id+'-REF',supplierCountry:'EG',currency:'EGP',exchangeRate:1,taxReviewed:true,invoiceLines:lines,...extra};}
function steps(s){return [
 {id:'PV-OPEN',group:'التأسيس',title:'تمويل البداية',explain:'بنك مقابل رأس مال؛ مثال متوازن بقيمة500,000جنيه.',doc:{type:'opening',date:'2026-09-01',description:'تمويل الشركة للمعاينة',amount:500000,debitAccount:'112101',creditAccount:'310000'}},
 {id:'PV-PURCHASE',group:'شراء منتجات وخدمات',title:'فاتورة مورد ببنود مختلفة',explain:'10أجهزة + تركيب + اشتراك شهر. النسب14%و1/3/5% مدخلة للمثال فقط.',doc:invoice('PV-PURCHASE','purchase','أجهزة وتركيب واشتراك · نسب توضيحية',[line('DEV','10أجهزة للمخزون',1000,{item:'IT001',category:'منتج',qty:10,treatment:'goods',account:'512000',whtRate:1}),line('INSTALL','خدمة تجهيز الأجهزة',500,{whtRate:3}),line('SUB','اشتراك برنامج لشهر سبتمبر',1200,{treatment:'prepaid',serviceFrom:'2026-09-01',serviceTo:'2026-09-30',whtRate:5})])},
 {id:'PV-RECEIPT-STOCK',group:'المخازن',title:'استلام الأجهزة من نفس الفاتورة',explain:'استلام10قطع في الرئيسي. الحركة كمية؛ لا تكرر مصروف أو فاتورة المورد.',doc:{type:'stockin',date:'2026-09-04',description:'استلام أجهزة الفاتورةPV-PURCHASE',item:'IT001',warehouse:'WH01',qty:10,unitCost:1000,source:'PV-PURCHASE',sourceLine:'DEV'}},
 {id:'PV-PAYMENT',group:'شراء منتجات وخدمات',title:'سداد جزئي للمورد مع الخصم',explain:'تسوية6,000من الالتزام. النقد والخصم يظهران منفصلين وفق نسب المثال.',doc:{type:'settlement',date:'2026-09-10',description:'سداد جزئي للمورد',invoice:'PV-PURCHASE',amount:6000,cash:'112101',fee:5}},
 {id:'PV-SALES',group:'بيع منتجات وخدمات',title:'فاتورة جهاز وتركيب ودعم',explain:'نفس فاتورة العميل تشمل منتجًا وخدمات. لكل بند حسابه ونسبه.',doc:invoice('PV-SALES','sales','بيع أجهزة وتركيب ودعم للعميل',[line('DEVICE','بيع3أجهزة',1600,{item:'IT001',category:'منتج',qty:3,account:'411000',whtRate:1}),line('INSTALL','تركيب وتشغيل',600,{account:'412000',whtRate:3}),line('SUPPORT','دعم فني',900,{account:'412000',whtRate:5})],{date:'2026-09-06',due:'2026-10-06'})},
 {id:'PV-STOCK-ISSUE',group:'المخازن',title:'تسليم الأجهزة للعميل',explain:'صرف3قطع من الرئيسي مرتبط ببند الأجهزة في فاتورة البيع.',doc:{type:'stockout',date:'2026-09-07',description:'تسليم أجهزة العميل',item:'IT001',warehouse:'WH01',qty:3,source:'PV-SALES',sourceLine:'DEVICE'}},
 {id:'PV-SALES-2',group:'بيع منتجات وخدمات',title:'فاتورة خدمة ثانية لنفس العميل',explain:'فاتورة مستقلة لتجربة دفعة واحدة موزعة على أكثر من فاتورة.',doc:invoice('PV-SALES-2','sales','جلسة تدريب تشغيل',[line('TRAIN','خدمة تدريب',1000,{account:'412000',vatRate:0,vatMode:'exempt',whtRate:3})],{date:'2026-09-08',due:'2026-10-08'})},
 {id:'PV-COLLECTION',group:'بيع منتجات وخدمات',title:'تحصيل موزع على فاتورتين',explain:'تحصيل يغلق الأولى ويسدد500من الثانية. الخصم منفصل عن النقد.',doc:{type:'settlementbatch',date:'2026-09-12',description:'تحصيل واحد موزع على فاتورتين',cash:'112101',fee:0,parts:[{invoice:'PV-SALES',amount:7182},{invoice:'PV-SALES-2',amount:500}]}},
 {id:'PV-STOCK-TRANSFER',group:'المخازن',title:'تحويل قطعتين للفرع',explain:'ينقص الرئيسي ويزيد الفرع؛ إجمالي الشركة لا يتغير.',doc:{type:'stocktransfer',date:'2026-09-13',description:'تجهيز مخزن الفرع',item:'IT001',warehouse:'WH01',target:'WH02',qty:2}},
 {id:'PV-FOREIGN',group:'خدمات رقمية',title:'فاتورة خدمة موقع أجنبي',explain:'100دولار ×50جنيه مع معاملة تكليف عكسي مختارة للمثال، وليست حكمًا ضريبيًا.',doc:invoice('PV-FOREIGN','purchase','خدمة استضافة أجنبية · مثال مراجعة',[line('HOST','استضافة موقع المشروع',100,{vatMode:'reverse',vatRate:14,whtRate:0})],{date:'2026-09-05',due:'2026-10-05',party:'V002',supplierCountry:'US',currency:'USD',exchangeRate:50})},
 {id:'PV-FX-PAY',group:'خدمات رقمية',title:'سداد الخدمة وفروق العملة',explain:'تسوية2,500من القيمة الدفترية بسعر52، ورسوم10، مع إثبات فرق العملة.',doc:{type:'settlement',date:'2026-09-14',description:'سداد جزئي للموقع الأجنبي',invoice:'PV-FOREIGN',amount:2500,cash:'112101',paymentRate:52,fee:10}},
 {id:'PV-PREPAID',group:'خدمات رقمية',title:'تحميل اشتراك سبتمبر',explain:'ينقل الاشتراك المدفوع مقدمًا للمصروف خلال المدة المحددة دون تكرار.',doc:{type:'prepaidrelease',date:'2026-09-30',from:'2026-09-01',description:'تحميل اشتراك سبتمبر',invoice:'PV-PURCHASE',invoiceLine:'SUB',amount:1200}},
 {id:'PV-ASSET',group:'الأصول',title:'اقتناء حاسب للشركة',explain:'أصل24,000وعمر24شهرًا. إعداد العمر سياسة مثال قابل للمراجعة.',doc:{type:'asset',date:'2026-09-01',description:'حاسب للشركة · معاينة',assetId:'PV-FA01',ready:'2026-09-01',amount:24000,life:24,residual:0,counter:'112101'}},
 {id:'PV-DEP',group:'الأصول',title:'إهلاك الحاسب',explain:'إهلاك شهر أكتوبر1,000وفق السياسة التجريبية في المحرك.',doc:{type:'depreciation',date:'2026-10-20',description:'إهلاك الحاسب عن أكتوبر',assetId:'PV-FA01',amount:1000}},
 {id:'PV-RESEARCH',group:'تطوير داخلي',title:'تكلفة بحث للمشروع الداخلي',explain:'تكلفة بحث2,000تعالج كمصروف في السيناريو.',doc:{type:'cipcost',date:'2026-09-02',description:'بحث للمنتج الداخلي',project:'PV-PR01',source:'PV-SOURCE-RESEARCH',sourceLine:'1',sourceTotal:2000,amount:2000,category:'بحث',treatment:'expense',direct:false,evidence:'محضر بحث توضيحي',counter:'112101'}},
 {id:'PV-DEV',group:'تطوير داخلي',title:'تطوير مؤهل تحت التنفيذ',explain:'تكلفة10,000لمشروع داخلي تحقق شروطه في بيانات المثال.',doc:{type:'cipcost',date:'2026-09-08',description:'تكلفة تطوير المنتج الداخلي',project:'PV-PR01',source:'PV-SOURCE-DEV',sourceLine:'1',sourceTotal:10000,amount:10000,category:'تطوير',treatment:'capital',direct:true,evidence:'اعتماد تطوير توضيحي',counter:'112101'}},
 {id:'PV-READY',group:'تطوير داخلي',title:'جاهزية وتحويل البرنامج',explain:'نقل التكلفة من تحت التنفيذ إلى برنامج جاهز مرة واحدة.',doc:{type:'ciptransfer',date:'2026-09-15',description:'جاهزية البرنامج الداخلي',project:'PV-PR01',assetId:'PV-SW01',gross:10000,movedLoss:0,residual:0,life:36,evidence:'محضر جاهزية للمعاينة'}},
 {id:'PV-AMORT',group:'تطوير داخلي',title:'إطفاء البرنامج عن سبتمبر',explain:'يحسب المحرك الإطفاء اليومي من تاريخ الجاهزية.',doc:{type:'amort',date:'2026-09-30',from:'2026-09-15',description:'إطفاء البرنامج الداخلي',project:'PV-PR01',amount:s&&s.docs.some(d=>d.id==='PV-READY'&&d.status==='posted')?(E.amortDue(s,'PV-PR01','2026-09-15','2026-09-30')/100).toFixed(2):0}},
 {id:'PV-PAYROLL',group:'الرواتب',title:'مسير راتب سبتمبر',explain:'راتب12,000وحصة عامل11%وشركة18.75% كافتراضات مثال، وضريبة يدوية500.',doc:{type:'payroll',date:'2026-09-30',description:'راتب سبتمبر · أرقام مثال',employee:'E001',salary:12000,insured:10000,extras:0,absence:0,tax:500,other:0,advance:0}},
 {id:'PV-SALARY',group:'الرواتب',title:'سداد صافي الراتب',explain:'سداد صافي المسير10,400في بيانات المثال.',doc:{type:'salarypay',date:'2026-10-01',description:'سداد صافي راتب سبتمبر',amount:10400,cash:'112101'}},
 {id:'PV-INSURANCE',group:'الرواتب',title:'سداد حصتي التأمينات',explain:'سداد2,975لإغلاق حصتي العامل والشركة في المثال.',doc:{type:'insurancepay',date:'2026-10-02',description:'سداد حصتي التأمينات · مثال',amount:2975,cash:'112101'}},
 {id:'PV-STOCK-CLOSE',group:'المطابقة',title:'تقييم المخزون الدوري',explain:'إقفال مشتريات10,000إلى مخزون ختامي7,000وتكلفة مبيعات3,000.',doc:{type:'stockclose',date:'2026-09-30',description:'تقييم المخزون الدوري · سبتمبر'}},
 {id:'PV-DRAFT',group:'المراجعة',title:'مسودة مصروف للمراجعة',explain:'المسودة لا تغيّر البنك أو الربح أو أي رصيد.',draft:true,doc:{type:'journal',date:'2026-10-29',description:'مسودة رسوم للمراجعة دون أثر مالي',lines:[{account:'622000',debit:75,credit:0},{account:'112101',debit:0,credit:75}]}}
 ].map(x=>({...x,doc:{...x.doc,id:x.id},status:s?.docs.find(d=>d.id===x.id)?.status||'not_started'}));}
function runStep(s,id){const st=steps(s).find(x=>x.id===id);if(!st)throw Error('خطوة غير موجودة');if(s.docs.some(x=>x.id===id))return E.find(s,id);return st.draft?saveDraft(s,st.doc):post(s,st.doc);}
function create(options={}){
 const s=E.initial(chart());
 s.config.company='صلاح للتجارة والخدمات · شركة معاينة';
 s.config.exampleRatesOnly=true;
 s.config.rateNotice='نسب الضرائب والتأمينات في بيانات السيناريو أمثلة تعليمية يراجعها المستخدم؛ ليست نسبًا قانونية معتمدة.';
 s.view={from:'2026-09-01',to:'2026-10-29',asof:'2026-10-29'};
 s.customers[0].name='شركة المدار · عميل معاينة';s.vendors[0].name='التقنية والتجارة · مورد معاينة';
 s.vendors.push({id:'V002',name:'Cloud Example · موقع أجنبي للمعاينة',days:30,country:'US'});
 s.projects.push({id:'PV-PR01',name:'منتج داخلي · مشروع معاينة',kind:'غير ملموس',rights:'الشركة',control:true,criteria:[true,true,true,true,true,true],recognition:'2026-09-01',ready:'2026-09-15',budget:30000,life:36,approval:'PV-DEV-APPROVAL'});
 s.preview={version:'2026-10-29-preview-1',localOnly:true,periodicStock:true,exampleRatesOnly:true,source:'Existing Accounting engine; preview adapter only',attachments:[],serviceCatalog:[{id:'S001',name:'تركيب وتشغيل',unit:'خدمة'},{id:'S002',name:'دعم واشتراك',unit:'شهر'}]};
 if(options.demo!==false)for(const st of steps(s))runStep(s,st.id);
 return s;
}
function dashboard(s){const to=s.view?.to||'9999-12-31',from=s.view?.from||'0000-01-01',f=E.financial(s,to,from),trial=E.trial(s,to,from);return {...f,debit:E.sum(trial,x=>x.debit),credit:E.sum(trial,x=>x.credit),drafts:s.docs.filter(d=>d.status==='draft').length,pending:s.docs.filter(d=>['review','approved'].includes(d.status)).length,posted:E.posted(s,null,to).length,stock:s.locations.filter(l=>l.type==='مخزن').flatMap(w=>s.items.map(i=>({warehouse:w.id,warehouseName:w.name,item:i.id,itemName:i.name,qty:E.stock(s,i.id,w.id,to)})))};}
function reports(s){const to=s.view?.to||'9999-12-31',from=s.view?.from||'0000-01-01';return {financial:E.financial(s,to,from),trial:E.trial(s,to,from),journal:E.journalRows(s,to,from),stock:dashboard(s).stock,invoices:E.posted(s,null,to).filter(d=>['sales','purchase'].includes(d.type)).map(d=>({id:d.id,type:d.type,party:d.party,date:d.date,due:d.due,total:d.invoiceLines?E.invoiceTotals(s,d).payable:E.money(d.amount),remaining:E.remaining(s,d.id,to),daysLate:Math.max(0,Math.floor((Date.parse(to)-Date.parse(d.due))/86400000))})),projects:s.projects.map(p=>({id:p.id,name:p.name,...E.cip(s,p.id,to)})),payroll:E.posted(s,'payroll',to).map(d=>({id:d.id,employee:d.employee,date:d.date,...d.payrollSnapshot}))};}
const M={create,dashboard,reports,post,saveDraft,lifecycle,steps,runStep,stockLink,chart};
if(typeof module!=='undefined'&&module.exports)module.exports=M;else root.PreviewModel=M;
})(typeof window!=='undefined'?window:globalThis);
