(()=>{var e={};e.id=976,e.ids=[976],e.modules={846:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},4870:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},3295:e=>{"use strict";e.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},9294:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-async-storage.external.js")},3033:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},6086:(e,t,i)=>{"use strict";i.r(t),i.d(t,{patchFetch:()=>v,routeModule:()=>u,serverHooks:()=>l,workAsyncStorage:()=>c,workUnitAsyncStorage:()=>h});var s={};i.r(s),i.d(s,{GET:()=>p});var r=i(2706),n=i(8203),a=i(5994),d=i(9187);let o=(e,t)=>`
(function(){
  'use strict';
  var d=document,w=window,n=navigator,s=screen;
  var sid='${e}',api='${t}';

  function hash(str){
    var h=0;for(var i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}
    return h.toString(36);
  }

  function send(type,data){
    var payload=Object.assign({
      sid:sid,
      type:type,
      url:location.href,
      ref:d.referrer||'',
      sw:s.width,
      sh:s.height,
      lang:n.language,
      ts:Date.now(),
      vid:hash(n.userAgent+s.width+s.height)
    },data||{});

    if(n.sendBeacon){
      n.sendBeacon(api+'/api/collect',JSON.stringify(payload));
    }else{
      var xhr=new XMLHttpRequest();
      xhr.open('POST',api+'/api/collect',true);
      xhr.setRequestHeader('Content-Type','application/json');
      xhr.send(JSON.stringify(payload));
    }
  }

  // Track pageview
  send('pageview');

  // Track navigation (SPA support)
  var pushState=history.pushState;
  history.pushState=function(){
    pushState.apply(history,arguments);
    send('pageview');
  };
  w.addEventListener('popstate',function(){send('pageview');});

  // Track page visibility
  var hidden,visChange;
  if(typeof d.hidden!=='undefined'){hidden='hidden';visChange='visibilitychange';}
  else if(typeof d.msHidden!=='undefined'){hidden='msHidden';visChange='msvisibilitychange';}
  else if(typeof d.webkitHidden!=='undefined'){hidden='webkitHidden';visChange='webkitvisibilitychange';}

  var startTime=Date.now();
  if(visChange){
    d.addEventListener(visChange,function(){
      if(d[hidden]){
        send('leave',{duration:Date.now()-startTime});
      }else{
        startTime=Date.now();
      }
    });
  }

  w.addEventListener('beforeunload',function(){
    send('leave',{duration:Date.now()-startTime});
  });
})();
`.trim();async function p(e,{params:t}){let{siteId:i}=await t,s=o(i,process.env.NEXT_PUBLIC_API_URL||"https://ztas.io");return new d.NextResponse(s,{headers:{"Content-Type":"application/javascript","Cache-Control":"public, max-age=3600","Access-Control-Allow-Origin":"*"}})}let u=new r.AppRouteRouteModule({definition:{kind:n.RouteKind.APP_ROUTE,page:"/api/script/[siteId]/route",pathname:"/api/script/[siteId]",filename:"route",bundlePath:"app/api/script/[siteId]/route"},resolvedPagePath:"/Users/jasonsutter/Documents/Companies/ZTA.io/zero-trust-analytics/nextjs/src/app/api/script/[siteId]/route.ts",nextConfigOutput:"",userland:s}),{workAsyncStorage:c,workUnitAsyncStorage:h,serverHooks:l}=u;function v(){return(0,a.patchFetch)({workAsyncStorage:c,workUnitAsyncStorage:h})}},6487:()=>{},8335:()=>{}};var t=require("../../../../webpack-runtime.js");t.C(e);var i=e=>t(t.s=e),s=t.X(0,[638,452],()=>i(6086));module.exports=s})();