import { NextRequest, NextResponse } from 'next/server'

// Minified tracking script - under 2KB gzipped
const generateScript = (siteId: string, apiUrl: string) => `
(function(){
  'use strict';
  var d=document,w=window,n=navigator,s=screen;
  var sid='${siteId}',api='${apiUrl}';

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
`.trim()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

  const script = generateScript(siteId, apiUrl)

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    }
  })
}
