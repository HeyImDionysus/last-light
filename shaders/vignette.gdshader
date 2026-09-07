shader_type canvas_item;
uniform float hurt=0.0;
uniform float darkness=0.0;
uniform float fade=0.0;
void fragment(){
 vec2 p=UV*2.0-1.0;
 float edge=smoothstep(.36,1.4,length(p*vec2(.9,1.0)));
 vec3 ink=mix(vec3(.005,.012,.02),vec3(.33,.065,.043),hurt);
 float a=edge*(.23+darkness*.38+hurt*.44);
 COLOR=vec4(ink,max(a,fade));
}
