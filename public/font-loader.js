[400,500,600,700].forEach(function(w){
  var f=new FontFace('Google Sans Flex',
    "url('/fonts/GoogleSansFlex-"+w+".woff2')",
    {weight:String(w),style:'normal'});
  f.load().then(function(){document.fonts.add(f)});
});
try {
  var _p=JSON.parse(localStorage.getItem('aster_preferences_cache')||'{}');
  if(_p.dyslexia_font){
    [{w:400,n:'Regular'},{w:700,n:'Bold'}].forEach(function(d){
      var f=new FontFace('OpenDyslexic',
        "url('/fonts/OpenDyslexic-"+d.n+".woff2')",
        {weight:String(d.w),style:'normal'});
      f.load().then(function(){document.fonts.add(f);});
    });
  }
}catch(e){}
