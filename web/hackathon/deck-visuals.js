// Presentation only: generated from the frozen deck, never mutates judging data.
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const short=(s,n=75)=>s.length>n?s.slice(0,n-1).trim()+'…':s;
const text=(s,x,y,size=22,color='#dce7f4')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="Arial,sans-serif">${escape(s)}</text>`;
function lines(s,x,y,width=48,size=25){const words=String(s).split(/\s+/);let rows=[''];for(const word of words){if((rows.at(-1)+' '+word).length>width)rows.push(word);else rows[rows.length-1]+=(rows.at(-1)?' ':'')+word}return rows.slice(0,3).map((line,i)=>text(short(line,width+2),x,y+i*(size+12),size)).join('')}
const box=(x,y,w,h,fill='#142334',stroke='#2b4056',rx=20)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
const edge=(x,y,x2,y2)=>`<path d="M${x} ${y} L${x2} ${y2}" stroke="#65dec7" stroke-width="3" fill="none" marker-end="url(#arrow)"/>`;
function node(label,x,y,index){return box(x,y,255,130)+text(String(index).padStart(2,'0'),x+24,y+35,16,'#65dec7')+lines(label,x+24,y+77,19,23)}
export function slideImage(data,index){
 const design=data.deck_design||{accent:"#65dec7",layout:0};
 const slide=data.deck[index], spec=data.project||{...data.dapp,architecture:data.dapp?.blockchain};
 let drawing='';
 if(index===0){
 drawing=lines(spec.name,70,235,26,48)+lines(short(spec.problem,130),70,415,43,24);
 drawing+=`<circle cx="940" cy="365" r="180" fill="none" stroke="#294e66"/><circle cx="940" cy="365" r="120" fill="none" stroke="#65dec7" stroke-dasharray="8 12"/>`;
 const satellites=4+(design.layout||0);for(let i=0;i<satellites;i++){const angle=i*Math.PI*2/satellites,x=940+Math.cos(angle)*180,y=365+Math.sin(angle)*180;drawing+=edge(940,365,x,y)+`<circle cx="${x}" cy="${y}" r="18" fill="#65dec7"/>`}
 drawing+=box(870,305,140,120,'#203e48','#65dec7')+text('AI × APP',882,370,24);
 }else if(index===1||index===2){
 const labels=index===1?(spec.architecture_nodes||['Interface','Application','Data']):(spec.ai_workflow||['Input','AI processing','Reviewed output']);
 const ys=design.layout===1?[210,300,210]:design.layout===2?[300,210,300]:[250,250,250];drawing=labels.map((l,i)=>node(l,80+i*410,ys[i],i+1)).join('')+edge(335,ys[0]+65,475,ys[1]+65)+edge(745,ys[1]+65,885,ys[2]+65);
 drawing+=lines(short(index===1?spec.architecture:spec.ai_role,170),80,495,76,25)+text('CONCEPTUAL FLOW · NOT A DEPLOYED SYSTEM',80,625,15,'#819bb4');
 }else if(index===3){
 drawing=box(80,190,1120,370)+box(80,190,220,370,'#102030')+text('WORKSPACE',110,240,17,'#65dec7');
 ['Overview',short(spec.functions[0],18),'Activity'].forEach((l,i)=>{drawing+=box(100,270+i*65,180,45,i===0?'#254954':'#102030')+text(l,116,300+i*65,18)});
 drawing+=text(short(spec.name,36),340,240,25)+box(960,212,210,40,'#224a46')+text('Open workspace',980,239,18);
 for(let i=0;i<3;i++)drawing+=box(340+i*275,270,250,100)+text(short(spec.functions[i]||'Results',19),360+i*275,306,18)+text('—',360+i*275,350,35,'#65dec7');
 drawing+=box(340,400,525,120)+text('Activity visualization',360,435,19);
 for(let i=0;i<5;i++)drawing+=`<rect x="${370+i*90}" y="470" width="60" height="8" rx="4" fill="#3c6075"/>`;
 drawing+=box(890,400,280,120)+text(short(spec.functions[0],20)+' +',912,465,18)+text('UI WIREFRAME · PLACEHOLDERS, NOT USAGE METRICS',80,605,15,'#819bb4');
 }else if(index===4){
 drawing=spec.functions.map((f,i)=>{const x=75+(i%3)*400,y=205+Math.floor(i/3)*190;return node(short(f,50),x,y,i+1)}).join('');
 }else if(index===5){
 drawing=node('Prototype',80,255,1)+node('Validate & audit',490,255,2)+node('Deploy',900,255,3)+edge(335,320,485,320)+edge(745,320,895,320)+lines(short(spec.limitations,175),80,490,76,24)+text('ROADMAP · FUTURE WORK, NOT COMPLETED MILESTONES',80,625,15,'#819bb4');
 }else{
 const types=['research','build','test','pitch'];const counts=types.map(t=>data.artifacts.filter(a=>a.type===t).length),max=Math.max(1,...counts);
 drawing=text('Recorded project artifacts',80,215,28)+text(`${data.artifacts.length}`,995,245,76,'#65dec7')+text('ARTIFACTS',995,280,16,'#819bb4');
 types.forEach((type,i)=>{const y=290+i*75;drawing+=text(type.toUpperCase(),80,y+22,18)+box(260,y,640,30,'#182c3d','#182c3d',8)+box(260,y,Math.max(1,counts[i]/max*640),30,'#65dec7','#65dec7',8)+text(String(counts[i]),925,y+24,23)});
 drawing+=text('COUNTS FROM THIS SUBMISSION · NO ESTIMATED TRACTION',80,640,15,'#819bb4');
 }
 const titles=['The idea','How the product works','What AI unlocks','The product, at a glance','Core interactions','From prototype to deployment','Evidence, not promises'];
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img"><title>${escape(slide.title)}</title><desc>${escape(slide.body)}</desc><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0d1828"/><stop offset="1" stop-color="#0b111b"/></linearGradient><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="#65dec7"/></marker><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0 H0 V40" fill="none" stroke="#294355" opacity=".16"/></pattern></defs><rect width="1280" height="720" fill="url(#bg)"/><rect width="1280" height="720" fill="url(#grid)"/><rect x="0" y="0" width="8" height="720" fill="#65dec7"/>${text('ASTRA HOUSE / VENTURE DECK',70,60,15,'#65dec7')}${text(titles[index]||slide.title,70,125,36)}${drawing}${text(`${String(index+1).padStart(2,'0')} / ${data.deck.length}`,1130,675,16,'#819bb4')}${text('FROZEN SUBMISSION',70,690,12,'#819bb4')}</svg>`;
 const accent=/^#[0-9a-f]{6}$/i.test(design.accent)?design.accent:'#65dec7';return svg.replaceAll('#65dec7',accent);
}
