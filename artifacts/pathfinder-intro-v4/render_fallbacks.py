"""Transparent resting poses for loading, reduced motion and graphics fallback."""
import bpy
from pathlib import Path
HERE=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE/'pointfinder-expanding-world.blend'))
scene=bpy.context.scene
scene.render.film_transparent=True
bpy.data.objects['Studio backdrop'].hide_render=True
scene.render.image_settings.media_type='IMAGE'
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_percentage=80
scene.eevee.taa_render_samples=24
for i,frame in enumerate([125,301,371,465,580,765,864],1):
    scene.frame_set(frame)
    scene.render.filepath=str(HERE/f'step-{i}.png')
    bpy.ops.render.render(write_still=True)
# Inspect the new fade in the source scene as well as the runtime.
for frame in [790,802,814,832]:
    scene.frame_set(frame)
    scene.render.filepath=str(HERE/'qa'/f'fade-{frame}.png')
    bpy.ops.render.render(write_still=True)
