[400,500,600,700].forEach(function(w){
  var f=new FontFace('Google Sans Flex',
    "url('/fonts/GoogleSansFlex-"+w+".woff2')",
    {weight:String(w),style:'normal'});
  f.load().then(function(){document.fonts.add(f)});
});
