shader_type spatial;
render_mode cull_disabled, diffuse_burley;
uniform vec4 tint:source_color=vec4(.24,.37,.28,1.0);
uniform float wind_strength=.055;
uniform bool grass=false;
varying vec3 local_position;
void vertex(){
 vec3 wp=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 local_position=VERTEX;
 float mask=grass?clamp(VERTEX.y*1.6,0.0,1.0):clamp(VERTEX.y*.08,0.0,1.0);
 float wind=sin(TIME*1.1+wp.x*.21+wp.z*.19)+sin(TIME*1.9+wp.z*.57)*.4;
 VERTEX.x+=wind*wind_strength*mask;
 VERTEX.z+=cos(TIME*.8+wp.x*.23)*wind_strength*mask*.65;
 if(grass){NORMAL=normalize(vec3(NORMAL.x*.2,1.0,NORMAL.z*.2));}
}
void fragment(){
 ALBEDO=tint.rgb*COLOR.rgb;
 ROUGHNESS=.91;
 SPECULAR=.2;
 BACKLIGHT=ALBEDO*.35;
}
