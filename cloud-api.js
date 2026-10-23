/* Cloud adapter: only public project settings enter the static site. */
window.NFCCloud=(()=>{
 let config={mode:'local'},session=null,refreshing=null;
 const storageKey='nfc-cloud-session';
 const ready=fetch('./cloud-config.json',{cache:'no-store'}).then(async r=>{
  if(!r.ok)throw new Error('Не удалось загрузить настройки приложения.');
  config=await r.json();
  if(config.mode==='cloud'){
   const url=new URL(config.url);if(url.protocol!=='https:')throw new Error('Для облака требуется HTTPS.');
   config.url=url.origin;
   if(!config.key||!config.key.startsWith('sb_publishable_'))throw new Error('Не указан публичный ключ проекта.');
   try{session=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
  }
  return config;
 });
 function persist(value){session=value;try{if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);}catch{}}
 function needLogin(){persist(null);window.dispatchEvent(new Event('nfc:authrequired'));const e=new Error('Войдите в панель.');e.auth=true;throw e;}
 async function auth(path,body){
  const response=await fetch(config.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error_code==='invalid_credentials'?'Неверная почта или пароль.':data.msg||data.error_description||data.message||'Не удалось выполнить вход.');
  return data;
 }
 async function token(){
  if(!session?.access_token)return needLogin();
  if(session.expires_at*1000>Date.now()+60000)return session.access_token;
  if(!refreshing)refreshing=auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(s=>{persist({...s,expires_at:Math.floor(Date.now()/1000)+s.expires_in});return s.access_token;}).catch(()=>needLogin()).finally(()=>{refreshing=null;});
  return refreshing;
 }
 async function rpc(name,body={}){
  const access=await token();
  const response=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:config.key,Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(response.status===401)return needLogin();
  if(!response.ok){if(data.code==='42501'){persist(null);window.dispatchEvent(new CustomEvent('nfc:authrequired',{detail:data.message}));const e=new Error(data.message);e.auth=true;throw e;}throw new Error(data.message||'Ошибка облачной базы.');}return data;
 }
 async function api(path,method='GET',body={}){
  await ready;const u=new URL(path,location.origin),p=u.pathname;
  if(p==='/api/state')return rpc('nfc_state');
  if(p==='/api/events')return rpc('nfc_events_list',{p_search:u.searchParams.get('search')||'',p_source:u.searchParams.get('source')||'',p_kind:u.searchParams.get('kind')||'',p_limit:Number(u.searchParams.get('limit')||200)});
  if(p==='/api/cards'&&method==='POST')return rpc('nfc_save_card',{p_data:body,p_id:null});
  const card=p.match(/^\/api\/cards\/(\d+)$/);
  if(card&&method==='PUT')return rpc('nfc_save_card',{p_data:body,p_id:Number(card[1])});
  if(card&&method==='DELETE')return rpc('nfc_delete_card',{p_id:Number(card[1])});
  if(p==='/api/demo')return rpc('nfc_demo',{p_uid:body.uid});
  if(p==='/api/device/command')return rpc('nfc_queue_command',{p_command:body.command});
  if(p==='/api/ports')return [];
  throw new Error('USB доступен в локальной версии. Облачный стенд подключается по Wi-Fi автоматически.');
 }
 return {ready,get enabled(){return config.mode==='cloud';},get email(){return session?.user?.email||config.ownerEmail||'';},api,
  async signIn(email,password){await ready;const s=await auth('token?grant_type=password',{email,password});persist({...s,expires_at:Math.floor(Date.now()/1000)+s.expires_in});window.dispatchEvent(new Event('nfc:authenticated'));},
  async signUp(email,password){await ready;return auth('signup',{email,password});},
  async signOut(){const access=session?.access_token;persist(null);if(access)await fetch(config.url+'/auth/v1/logout',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+access},signal:AbortSignal.timeout(5000)}).catch(()=>{});location.reload();},
  async export(query){const u=new URLSearchParams(query),events=await rpc('nfc_events_list',{p_search:u.get('search')||'',p_source:u.get('source')||'',p_kind:'',p_limit:10000});
   const cell=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
   const rows=[['Время сервера (UTC)','Время DS3231 (МСК)','UID','Владелец','Тип','Источник','Подробности'],...events.map(e=>[e.time,e.device_time,e.uid,e.name,e.kind,e.source,e.detail])];
   const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download='nfc-events.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
 };
})();

