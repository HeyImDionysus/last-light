extends SceneTree
## Keep the notices of the exact engine used to build the release.
func _initialize() -> void:
	var path: String = "res://docs/ENGINE_NOTICES.txt"
	var file: FileAccess = FileAccess.open(path,FileAccess.WRITE)
	if not file:
		push_error("Could not write engine notices.")
		quit(1)
		return
	file.store_string("LAST LIGHT — ENGINE AND THIRD-PARTY NOTICES\nGodot "+Engine.get_version_info().string+"\n\n"+Engine.get_license_text()+"\n\nCOMPONENT COPYRIGHTS\n")
	file.store_string(JSON.stringify(Engine.get_copyright_info(),"  ")+"\n\nCOMPONENT LICENSES\n")
	var licenses: Dictionary = Engine.get_license_info()
	for name_value: String in licenses:
		file.store_string("\n=== "+name_value+" ===\n"+str(licenses[name_value])+"\n")
	file.close()
	quit()
