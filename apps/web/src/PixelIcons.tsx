import type { SVGProps } from 'react';
type Props=SVGProps<SVGSVGElement>;
const shapes={
 arrow:['00010000','00011000','00011100','11111110','00011100','00011000','00010000','00000000'],
 back:['00001000','00011000','00111000','01111111','00111000','00011000','00001000','00000000'],
 play:['01000000','01100000','01110000','01111000','01110000','01100000','01000000','00000000'],
 close:['11000011','01100110','00111100','00011000','00011000','00111100','01100110','11000011'],
 check:['00000001','00000011','00000110','11001100','01111000','00110000','00000000','00000000'],
 stats:['00000010','00000010','00001010','00001010','00101010','00101010','10101010','11111111'],
 help:['00111100','01100110','00000110','00001100','00011000','00000000','00011000','00011000'],
 calendar:['01000010','11111111','10000001','11111111','10101001','10010101','10101001','11111111'],
 sound:['00010000','00110100','11110010','11110010','11110010','00110100','00010000','00000000'],
 mute:['00010000','00110000','11110101','11110010','11110101','00110000','00010000','00000000'],
 share:['00010000','00111000','01111100','00010000','10010001','10000001','10000001','11111111'],
 download:['10000001','10010001','10010001','10111001','10010001','10000001','11111111','00000000'],
 reload:['00111100','01100010','11000011','10000011','11000000','01100001','00111110','00000000'],
 person:['00111000','01111100','00111000','00010000','01111100','11111110','11000110','00000000'],
 clock:['00111100','01010010','10010001','10011101','10000001','01000010','00111100','00000000'],
 shuffle:['11000001','00100011','00010111','00001000','00010111','00100011','11000001','00000000'],
 settings:['00100100','01111110','11000011','11011011','11011011','11000011','01111110','00100100'],
};
function icon(name:keyof typeof shapes){return function Icon({width=20,height=20,...props}:Props){return <svg width={width} height={height} viewBox="0 0 8 8" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true" {...props}>{shapes[name].flatMap((row,y)=>Array.from(row,(cell,x)=>cell==='1'?<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1"/>:null))}</svg>;};}
export const ArrowRightIcon=icon('arrow'),ChevronLeftIcon=icon('back'),PlayIcon=icon('play'),Cross2Icon=icon('close'),CheckIcon=icon('check'),BarChartIcon=icon('stats'),QuestionMarkCircledIcon=icon('help'),CalendarIcon=icon('calendar'),SpeakerLoudIcon=icon('sound'),SpeakerOffIcon=icon('mute'),Share2Icon=icon('share'),DownloadIcon=icon('download'),ReloadIcon=icon('reload'),PersonIcon=icon('person'),ClockIcon=icon('clock'),ShuffleIcon=icon('shuffle'),OpenInNewWindowIcon=icon('share'),SettingsIcon=icon('settings');
