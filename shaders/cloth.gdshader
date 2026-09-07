shader_type spatial;
render_mode cull_disabled, diffuse_burley;
uniform vec4 cloth_color:source_color=vec4(.27,.16,.09,1.0);
uniform float motion=0.0;
varying vec3 lp;
void vertex(){
 lp=VERTEX;
 float hem=clamp((.3-VERTEX.y)*1.3,0.0,1.0);
 VERTEX.z+=sin(TIME*3.0+VERTEX.x*8.0)*.018*hem*(1.0+motion*2.0);
 VERTEX.x+=sin(TIME*2.0+VERTEX.z*7.0)*.013*hem;
}
void fragment(){
 float weave=.95+sin(UV.x*330.0)*sin(UV.y*250.0)*.045;
 float seam=smoothstep(.022,.033,abs(fract(UV.x*8.0)-.5));
 ALBEDO=cloth_color.rgb*weave*(.86+seam*.14)*COLOR.rgb;
 ROUGHNESS=.97;
 SPECULAR=.1;
}
