// The room is a presentation of committed events; animation never mutates match state.
export class Room {
  constructor(canvas, select) {
    this.c=canvas;this.ctx=canvas.getContext('2d');this.select=select;this.people=[];this.selected='p0';this.zoom=1;this.pan={x:0,y:0};this.actors=new Map();this.reduced=false;this.animUntil=0;this.busy=false;
    this.desks=[[280,325],[440,325],[650,325],[810,325],[280,465],[440,465],[650,465],[810,465]];
    new ResizeObserver(()=>this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY,px:this.pan.x,py:this.pan.y,moved:false};canvas.setPointerCapture(e.pointerId)});
    canvas.addEventListener('pointermove',e=>{if(!this.drag)return;let dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.moved ||=Math.abs(dx)+Math.abs(dy)>5;this.pan={x:this.drag.px+dx,y:this.drag.py+dy}});
    canvas.addEventListener('pointerup',e=>{if(this.drag&&!this.drag.moved){let r=canvas.getBoundingClientRect(),x=(e.clientX-r.left-this.ox)/this.scale,y=(e.clientY-r.top-this.oy)/this.scale;let nearest=this.people.find(p=>{let a=this.actors.get(p.id);return Math.hypot(a.x-x,a.y-y)<35});if(!nearest){let i=this.desks.findIndex(([dx,dy])=>Math.abs(dx-x)<65&&Math.abs(dy-y)<40);nearest=this.people[i]}if(nearest)this.select(nearest.id)}this.drag=null});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.7,Math.min(2,this.zoom-e.deltaY*.001))},{passive:false});
    this.resize();requestAnimationFrame(t=>this.draw(t));
  }
  resize(){let r=this.c.getBoundingClientRect();let d=window.devicePixelRatio||1;this.c.width=r.width*d;this.c.height=r.height*d;this.w=r.width;this.h=r.height;this.dpr=d}
  set(people,animate=false){this.people=people;let now=performance.now();for(let i=0;i<people.length;i++){let p=people[i],desk=this.desks[i],prev=this.actors.get(p.id);let a={x:prev?.x||desk[0],y:prev?.y||desk[1]+38,home:[desk[0],desk[1]+38]};a.start=[a.x,a.y];a.target=this.destination(p.action,i);this.actors.set(p.id,a)}this.animStart=now;this.animUntil=animate&&!this.reduced?now+4200:0;}
  destination(action,i){return ({research:[122+(i%2)*27,245+Math.floor(i/2)*20],test:[932-(i%2)*30,260+Math.floor(i/2)*23],pitch:[480+(i%4)*35,180+Math.floor(i/4)*25],submit:[925-(i%2)*28,480+Math.floor(i/2)*20]})[action]||[this.desks[i][0],this.desks[i][1]+38]}
  skip(){this.animUntil=0}fit(){this.zoom=1;this.pan={x:0,y:0}}
  rect(x,y,w,h,color){let c=this.ctx;c.fillStyle=color;c.fillRect(x,y,w,h)}
  text(txt,x,y,size=10,color='#b9c7b6',align='left'){let c=this.ctx;c.fillStyle=color;c.font=`${size}px "DM Sans",sans-serif`;c.textAlign=align;c.fillText(txt,x,y)}
  plant(x,y){this.rect(x-9,y,18,17,'#a67759');this.rect(x-11,y-3,22,6,'#c59b6d');this.rect(x-2,y-31,4,29,'#67885a');for(let [dx,dy] of [[-13,-25],[1,-32],[-9,-15],[3,-20]]){this.rect(x+dx,y+dy,12,9,'#81a16c');this.rect(x+dx+3,y+dy-3,8,6,'#9ab87b')}}
  person(x,y,color,t,walk=false,i=0){let c=this.ctx;let bounce=this.reduced?0:Math.sin(t/160+i)* (walk?2:0.5);y+=bounce;c.fillStyle='#14221d50';c.beginPath();c.ellipse(x,y+16,13,5,0,0,7);c.fill();this.rect(x-8,y+7,6,10+(walk?Math.sin(t/90)*3:0),'#303a37');this.rect(x+2,y+7,6,10-(walk?Math.sin(t/90)*3:0),'#303a37');this.rect(x-10,y-9,20,19,color);this.rect(x-14,y-7,4,14,color);this.rect(x+10,y-7,4,14,color);this.rect(x-8,y-24,16,16,['#e1ba8d','#d5a579','#ba8c67'][i%3]);this.rect(x-9,y-27,18,7,['#453c35','#684d3a','#a07a4d'][i%3]);this.rect(x-9,y-22,4,6,'#453c35');this.rect(x-4,y-17,2,2,'#373b32');this.rect(x+4,y-17,2,2,'#373b32')}
  desk(x,y,p){this.rect(x-66,y-26,132,62,'#283a3440');this.rect(x-59,y+7,8,23,'#65523f');this.rect(x+51,y+7,8,23,'#65523f');this.rect(x-66,y-30,132,44,'#765d47');this.rect(x-66,y-34,132,39,'#b4946d');this.rect(x-63,y-31,126,4,'#c6a97d');this.rect(x-20,y-29,40,25,'#303f3b');this.rect(x-17,y-26,34,19,p?'#8da59b':'#5b6d60');if(p){this.rect(x-13,y-22,18,2,p.color);this.rect(x-13,y-17,26,2,'#c3d5ba');this.rect(x-13,y-12,15,2,'#728f7c')}this.rect(x-4,y-4,8,6,'#475d4b');this.rect(x-23,y+1,46,3,'#d1c19b');this.rect(x+42,y-13,9,10,'#e4dfc8');this.rect(x+44,y-16,5,4,'#d9d6bd');this.rect(x-43,y-12,12,15,'#e1d9b8');this.rect(x-40,y-9,7,2,p?p.color:'#a9b19a');if(p?.submission){this.rect(x+49,y-35,17,13,'#c6f46b');this.text('✓',x+57,y-25,11,'#304220','center')}if(!p)this.text('OPEN DESK',x,y+31,8,'#b8b79b','center')}
  scene(t){let c=this.ctx;
    this.rect(24,63,1032,505,'#121d1a50');this.rect(18,49,1044,507,'#a2a489');this.rect(30,63,1020,475,'#bbc0a2');
    for(let y=63;y<538;y+=26)for(let x=30;x<1050;x+=51){this.rect(x,y,50,25,(Math.floor(y/26)+Math.floor(x/51))%2?'#bfc2a6':'#b9bea0');this.rect(x,y+24,50,1,'#a7b090')}
    this.rect(18,48,1044,34,'#4b6051');this.rect(18,78,1044,5,'#3c5144');this.rect(18,48,12,508,'#768870');this.rect(1050,48,12,508,'#768870');this.rect(18,538,1044,18,'#718366');
    for(let x of [80,245,810,960]){this.rect(x,38,95,48,'#304a43');this.rect(x+5,42,85,37,'#a9c3b5');this.rect(x+44,42,4,37,'#54725f');this.rect(x+5,61,85,3,'#54725f');this.rect(x-4,81,104,5,'#9daa8c')}
    // Stage and screen.
    this.rect(365,89,360,130,'#646f5e');this.rect(365,85,360,124,'#d3c9a4');this.rect(363,207,364,9,'#938a6e');this.rect(395,195,300,13,'#b2a785');this.rect(442,78,212,95,'#273a34');this.rect(449,85,198,79,'#344a3c');this.text('ASTRA / HOUSE',548,111,16,'#c6f46b','center');this.text('BUILD SOMETHING',548,131,10,'#e3e8ce','center');this.text('THAT MATTERS.',548,146,10,'#e3e8ce','center');this.rect(398,146,22,46,'#49574a');this.rect(674,146,22,46,'#49574a');this.rect(402,154,14,14,'#293b30');this.rect(678,154,14,14,'#293b30');
    // Judges seated on the right of the stage.
    for(let i=0;i<(this.judgeCount??5);i++)this.person(763+i*(220/Math.max(1,(this.judgeCount??5)-1)),128,['#c5cbaa','#c0b7cd','#a9bfbd','#d4bba2','#b4bb99'][i%5],t,false,i);
    this.rect(747,139,244,29,'#8d795d');this.rect(747,134,244,28,'#c2ad82');for(let i=0;i<(this.judgeCount??5);i++)this.rect(755+i*(220/Math.max(1,(this.judgeCount??5)-1)),138,18,12,'#ede6cf');this.text('JUDGERS',868,187,9,'#65765b','center');
    // Research corner.
    this.rect(63,130,153,9,'#816e50');this.rect(69,136,140,60,'#e1dfc6');this.rect(74,196,5,24,'#6f7256');this.rect(196,196,5,24,'#6f7256');for(let i=0;i<6;i++){let x=83+(i%3)*38,y=144+Math.floor(i/3)*24;this.rect(x,y,25,16,['#c9d997','#e7bd85','#b9c9da'][i%3]);this.rect(x+4,y+4,14,2,'#91a076')}this.text('RESEARCH',140,231,9,'#5f7659','center');
    // Lounge rug, sofa, plants.
    this.rect(65,350,123,119,'#879b78');this.rect(70,355,113,109,'#91a481');this.rect(72,357,107,30,'#526e5d');this.rect(76,351,98,24,'#6b8b73');this.rect(76,363,31,20,'#82a183');this.rect(110,363,29,20,'#789b7e');this.rect(142,363,29,20,'#82a183');this.rect(87,415,74,29,'#a99c73');this.rect(91,411,66,27,'#c6b88b');this.rect(115,418,18,11,'#e4dec1');this.text('TAKE A BREATHER',126,490,8,'#6c7d5e','center');
    // Test station and kiosk.
    this.rect(900,221,106,15,'#958567');this.rect(909,197,88,33,'#354b40');this.rect(914,202,78,23,'#74928a');this.text('> RUN TEST_',954,217,9,'#d0e7c2','center');this.rect(901,236,8,32,'#756e53');this.rect(994,236,8,32,'#756e53');this.text('TEST LAB',954,286,9,'#5c7354','center');
    this.rect(931,411,62,60,'#617b62');this.rect(925,405,74,12,'#819b78');this.rect(940,424,44,22,'#c5dca3');this.text('↑',962,440,18,'#587146','center');this.text('SUBMIT',962,492,9,'#59724e','center');
    this.plant(53,106);this.plant(1023,107);this.plant(53,512);this.plant(1024,515);this.plant(857,208);this.plant(211,508);this.plant(864,508);
    this.desks.forEach(([x,y],i)=>this.desk(x,y,this.people[i]));
    this.rect(467,532,146,24,'#3c5043');this.text('WELCOME, BUILDERS',540,548,9,'#c3d1aa','center');
  }
  draw(t){let c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.w,this.h);this.scale=Math.min(this.w/1080,this.h/595)*this.zoom;this.ox=(this.w-1080*this.scale)/2+this.pan.x;this.oy=(this.h-595*this.scale)/2+this.pan.y;c.translate(this.ox,this.oy);c.scale(this.scale,this.scale);this.scene(t);
    for(let i=0;i<this.people.length;i++){let p=this.people[i],a=this.actors.get(p.id),progress=this.animUntil?Math.min(1,(t-this.animStart)/4200):1;let moving=false;if(this.animUntil&&t<this.animUntil){let k=progress<.35?progress/.35:progress>.75?(1-progress)/.25:1;k=Math.max(0,Math.min(1,k));let start=a.home,goal=a.target;a.x=start[0]+(goal[0]-start[0])*k;a.y=start[1]+(goal[1]-start[1])*k;moving=progress<.35||progress>.75}else{a.x=a.home[0];a.y=a.home[1]}
      if(this.winners?.includes(p.id)){a.x=500+this.winners.indexOf(p.id)*45;a.y=185;this.text('★',a.x,a.y-54,24,'#f2d26a','center')}
      if(p.id===this.selected){c.strokeStyle='#e5ffa4';c.lineWidth=2;c.beginPath();c.ellipse(a.x,a.y+17,19,8,0,0,7);c.stroke()}
      this.person(a.x,a.y,p.color,t,moving,i);let label=p.name.split(' ')[0]+(i===0?' · YOU':'');let width=Math.max(48,label.length*5.7+12);this.rect(a.x-width/2,a.y+23,width,16,p.id===this.selected?'#d2eda5':'#314735e8');this.text(label,a.x,a.y+34,9,p.id===this.selected?'#344627':'#e0e9cf','center');
      if(this.busy){this.rect(a.x-16,a.y-48,32,17,'#f0efd9');this.text('···',a.x,a.y-36,17,'#506947','center')}else if(p.action!=='idle'){this.rect(a.x-23,a.y-47,46,14,'#eef0dbea');this.text(({research:'IDEATE',build:'BUILD',test:'TEST',pitch:'PITCH',submit:'SENT'})[p.action]||'',a.x,a.y-37,7,'#556d45','center')}
    }requestAnimationFrame(t=>this.draw(t));
  }
}
