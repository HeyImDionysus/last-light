shader_type spatial;
render_mode cull_disabled, diffuse_burley, specular_schlick_ggx;
uniform bool ocean=true;
uniform vec3 water_color:source_color=vec3(.027,.09,.12);
varying vec3 world_position;
void vertex(){
 world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 if(ocean){VERTEX.y+=sin(world_position.x*.12+TIME*.45)*.055+cos(world_position.z*.18-TIME*.38)*.035;}
}
void fragment(){
 vec2 p=world_position.xz;
 float a=sin(p.x*1.7+p.y*.4+TIME*.45);
 float b=cos(p.y*2.1-p.x*.3-TIME*.55);
 NORMAL_MAP=normalize(vec3(a*.13,b*.13,1.0))*.5+.5;
 NORMAL_MAP_DEPTH=.8;
 float glint=pow(max(0.0,sin(p.x*.78+p.y*.83+TIME*.48)*cos(p.x*.91-p.y*.37-TIME*.4)),12.0);
 float edge=ocean?(1.0-smoothstep(71.0,75.0,length(p)))*smoothstep(68.0,71.0,length(p)):0.0;
 ALBEDO=water_color+vec3(.08,.12,.14)*glint+vec3(.09,.13,.13)*edge;
 ROUGHNESS=.22;
 METALLIC=.38;
 SPECULAR=.75;
}
