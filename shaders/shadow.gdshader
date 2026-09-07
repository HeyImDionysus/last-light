shader_type spatial;
render_mode cull_disabled, diffuse_burley;
uniform vec4 rim_color:source_color=vec4(.21,.39,.43,1.0);
uniform float agitation=0.0;
varying vec3 local_position;
void vertex(){local_position=VERTEX;VERTEX+=NORMAL*sin(VERTEX.y*8.0+VERTEX.x*4.0+TIME*2.8)*.022*(1.0+agitation);}
void fragment(){
 float vein=pow(.5+.5*sin(local_position.y*13.0+sin(local_position.x*11.0)*1.5+TIME*.4),14.0);
 float rim=pow(1.0-max(dot(NORMAL,VIEW),0.0),2.8);
 ALBEDO=vec3(.018,.025,.034)+vein*vec3(.018,.025,.025);
 EMISSION=rim_color.rgb*(rim*.5+vein*.065)*(1.0+agitation);
 ROUGHNESS=.72;
 METALLIC=.12;
}
