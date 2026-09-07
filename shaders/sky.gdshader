shader_type sky;
render_mode use_debanding;
uniform float dawn:hint_range(0.0,1.0)=0.0;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void sky(){
 vec3 ray=normalize(EYEDIR);
 float h=max(ray.y,0.0);
 vec3 night=mix(vec3(.105,.155,.19),vec3(.011,.023,.055),pow(h,.45));
 vec3 morning=mix(vec3(.88,.52,.26),vec3(.19,.36,.49),pow(h,.38));
 vec3 color=mix(night,morning,dawn);
 vec3 moon_dir=normalize(vec3(-.45,.47,-.76));
 float moon_distance=length(ray-moon_dir);
 float moon=smoothstep(.035,.031,moon_distance);
 float halo=exp(-moon_distance*17.0)*.09;
 color+=(vec3(.82,.90,1.0)*moon*1.7+vec3(.38,.54,.7)*halo)*(1.0-dawn*.9);
 vec2 cell=SKY_COORDS*vec2(750.0,375.0);
 vec2 id=floor(cell); vec2 p=fract(cell)-.5;
 float random=hash(id);
 float star=(1.0-smoothstep(.014,.085,length(p)))*step(.985,random);
 color+=vec3(.75,.82,.83)*star*smoothstep(.05,.4,h)*(1.0-dawn)*(.65+random);
 if(ray.y>.01){
  vec2 c=ray.xz/(ray.y+.25)*1.2+vec2(TIME*.0015,0.0);
  float cloud=noise(c)*.6+noise(c*2.1)*.27+noise(c*4.3)*.13;
  cloud=smoothstep(.48,.77,cloud)*.32;
  color=mix(color,mix(vec3(.14,.19,.23),vec3(.79,.62,.46),dawn),cloud);
 }
 COLOR=color;
}
