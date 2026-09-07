shader_type spatial;
render_mode unshaded, cull_disabled, blend_add, depth_draw_never, shadows_disabled;
uniform float strength=1.0;
void fragment(){float rim=pow(1.0-abs(dot(NORMAL,VIEW)),3.0);ALBEDO=vec3(.95,.72,.35);ALPHA=rim*strength*.32;}
