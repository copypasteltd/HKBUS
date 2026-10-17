import type {DeviceReminder} from './device-store';
import type {RouteArrivals} from './types';
import {arrivalView,stationArrivals,staleArrivals} from './arrivals';

export function matchingReminder(reminder:DeviceReminder,result:RouteArrivals,clock=Date.now()){
  if(reminder.status!=='active'||Date.parse(reminder.expires_at)<=clock||result.route.id!==reminder.route_id||staleArrivals(result,false,clock))return false;
  const first=stationArrivals(result.arrivals,reminder.route_id,reminder.stop_id,reminder.stop_sequence,clock)[0],value=arrivalView(first,clock);
  return (value.state==='minutes'||value.state==='due')&&value.minutes!==null&&value.minutes<=reminder.threshold;
}
