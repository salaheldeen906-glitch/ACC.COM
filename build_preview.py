from pathlib import Path
import re,base64,json
p=Path(__file__).parent
html=(p/'index.html').read_text()
def style(m):
 f=p/m.group(1);s=f.read_text()
 if f.name=='preview.css':
  font=base64.b64encode((p/'Cairo.ttf').read_bytes()).decode()
  s=s.replace('url(Cairo.ttf)','url(data:font/ttf;base64,'+font+')')
 return '<style>\n'+s+'\n</style>'
html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',style,html)
def script(m):
 s=(p/m.group(1)).read_text()
 s=re.sub(r'</script',lambda _:r'<\/script',s,flags=re.I)
 return '<script>\n'+s+'\n</script>'
html=re.sub(r'<script src="([^"]+)"></script>',script,html)
licenses='\n\n'.join((p/n).read_text() for n in ['Cairo_OFL.txt','EXCELJS-LICENSE.txt'])
html=html.replace('</body>','<!-- Embedded open-source assets: Cairo font and ExcelJS.\n'+licenses.replace('--','—')+'\n-->\n</body>')
(p/'dist').mkdir(exist_ok=True)
(p/'dist/index.html').write_text(html)
(p/'Salah_Accounting_Interactive_Preview_v1.html').write_text(html)
print(json.dumps({'bytes':len(html.encode()),'standalone':True,'external_scripts':re.findall(r'<script[^>]+src=',html),'external_css':re.findall(r'<link[^>]+stylesheet',html)}))
