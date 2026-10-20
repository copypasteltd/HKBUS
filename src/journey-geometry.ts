import type {OrderedStop} from './journey-planner.js';
type Geometry={type:'MultiLineString';coordinates:number[][][]};
type Anchor={position:number;point:number[];error:number;part:number;edge:number;t:number};
/** Clip existing official road segments. Never bridge a missing part or invent a road. */
export function journeyGeometry(geometry:Geometry|null|undefined,stops:OrderedStop[],board:number,alight:number):Geometry|null {
 if(!geometry||board>=alight||stops.length<2)return null;
 const b=stops.findIndex(x=>x.sequence===board),a=stops.findIndex(x=>x.sequence===alight);if(b<0||a<=b)return null;
 const segments:{p:number[];q:number[];part:number;edge:number;position:number}[]=[];
 let position=0;geometry.coordinates.forEach((path,part)=>{for(let edge=0;edge<path.length-1;edge++)segments.push({p:path[edge]!,q:path[edge+1]!,part,edge,position:position++});position++;});
 if(!segments.length)return null;
 const anchors=stops.map(stop=>{
  const latitude=stop.latitude,longitude=stop.longitude,kx=111320*Math.cos(latitude*Math.PI/180),ky=111320;
  const found:Anchor[]=[];
  for(const segment of segments){const dx=(segment.q[0]!-segment.p[0]!)*kx,dy=(segment.q[1]!-segment.p[1]!)*ky,sx=(longitude-segment.p[0]!)*kx,sy=(latitude-segment.p[1]!)*ky;
   const t=Math.max(0,Math.min(1,(sx*dx+sy*dy)/(dx*dx+dy*dy||1))),error=Math.hypot(sx-t*dx,sy-t*dy);
   if(error<=85)found.push({position:segment.position+t,point:[segment.p[0]!+(segment.q[0]!-segment.p[0]!)*t,segment.p[1]!+(segment.q[1]!-segment.p[1]!)*t],error,part:segment.part,edge:segment.edge,t});
  }
  const seen=new Set<string>();return found.sort((x,y)=>x.error-y.error).filter(x=>{const key=x.position.toFixed(5);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,24).sort((x,y)=>x.position-y.position);
 });
 if(anchors.some(x=>!x.length))return null;
 let costs=anchors[0]!.map(x=>x.error*x.error);const parents:number[][]=[costs.map(()=>-1)];
 for(let index=1;index<anchors.length;index++){
  const before=anchors[index-1]!,current=anchors[index]!,next=current.map(()=>Infinity),parent=current.map(()=>-1);
  current.forEach((candidate,j)=>before.forEach((previous,k)=>{if(candidate.position+1e-7<previous.position||!Number.isFinite(costs[k]))return;const value=costs[k]!+candidate.error*candidate.error;if(value<next[j]!){next[j]=value;parent[j]=k;}}));
  if(next.every(x=>!Number.isFinite(x)))return null;costs=next;parents.push(parent);
 }
 let cursor=costs.indexOf(Math.min(...costs));const selected:Anchor[]=new Array(anchors.length);
 for(let index=anchors.length-1;index>=0;index--){selected[index]=anchors[index]![cursor]!;cursor=parents[index]![cursor]!;}
 const first=selected[b]!,last=selected[a]!;if(last.position-first.position<1e-7)return null;
 const paths:number[][][]=[];
 for(let part=first.part;part<=last.part;part++){
  const original=geometry.coordinates[part]!,start=part===first.part?first.edge+1:0,end=part===last.part?last.edge+1:original.length;
  const path=[...part===first.part?[first.point]:[],...original.slice(start,end),...part===last.part?[last.point]:[]].filter((point,index,array)=>!index||point[0]!==array[index-1]![0]||point[1]!==array[index-1]![1]);
  if(path.length>1)paths.push(path);
 }
 return paths.length?{type:'MultiLineString',coordinates:paths}:null;
}
