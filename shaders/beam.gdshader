shader_type spatial;
render_mode unshaded, cull_disabled, blend_add, depth_draw_never, fog_disabled, shadows_disabled;
uniform vec4 beam_color:source_color=vec4(1.0,.69,.32,1.0);
uniform float intensity=.2;
void fragment(){
 float edge=pow(1.0-abs(UV.x-.5)*2.0,2.0);
 ALBEDO=beam_color.rgb;
 ALPHA=clamp(edge*(1.0-UV.y)*intensity,0.0,.12);
}
