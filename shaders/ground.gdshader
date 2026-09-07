shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
varying vec3 world_position;
varying vec4 terrain_data;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;terrain_data=COLOR;}
void fragment(){
 vec2 p=world_position.xz;
 float n=noise(p*2.8)*0.6+noise(p*12.0)*0.25+noise(p*.31)*.15;
 vec3 moss=mix(vec3(.095,.16,.127),vec3(.18,.23,.17),n);
 vec3 ash=mix(vec3(.14,.15,.16),vec3(.27,.26,.24),n);
 vec3 path=mix(vec3(.21,.205,.17),vec3(.34,.315,.245),n);
 vec3 soil=mix(moss,ash,terrain_data.g);
 ALBEDO=mix(soil,path,terrain_data.r*.85);
 ROUGHNESS=.94;
 SPECULAR=.16;
 NORMAL_MAP=vec3(.5+(noise(p*15.0)-.5)*.2,.5+(noise(p*15.0+3.2)-.5)*.2,1.0);
 NORMAL_MAP_DEPTH=.3;
}
