package com.fct.gardendless

import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

/** Staged extraction. Does not touch gp-next or WebView user storage. */
object GameAssetInstaller {
    private const val ROOT = "pvzge_web-master"
    private const val MAX_BYTES = 3L * 1024 * 1024 * 1024

    @Synchronized
    fun install(filesDir: File, version: Int, openArchive: () -> InputStream) {
        val active = File(filesDir, ROOT)
        // Recheck under the process-wide lock: another activity may have finished first.
        val marker = File(active, ".android-resource-version")
        if (File(active, "docs/index.html").isFile &&
            marker.takeIf { it.isFile }?.readText() == version.toString()) return
        val staging = File(filesDir, "$ROOT.staging")
        val backup = File(filesDir, "$ROOT.backup")
        // Recover an interrupted directory swap before starting a new one.
        if (!active.exists() && backup.exists()) check(backup.renameTo(active)) { "Cannot restore old resources" }
        if (staging.exists()) check(staging.deleteRecursively()) { "Cannot remove stale staging resources" }
        check(staging.mkdirs()) { "Cannot create resource staging directory" }
        val prefix = staging.canonicalPath + File.separator
        val seen = HashSet<String>()
        var bytes = 0L
        var count = 0
        try {
            ZipInputStream(openArchive().buffered()).use { zip ->
                var entry = zip.nextEntry
                while (entry != null) {
                    val name = entry.name
                    require(name.startsWith("$ROOT/") && !name.contains('\\') && !name.contains('\u0000')) { "Invalid resource path" }
                    val relative = name.removePrefix("$ROOT/").trimEnd('/')
                    if (relative.isNotEmpty()) {
                        require(relative.split('/').none { it.isEmpty() || it == "." || it == ".." || it.contains(':') }) { "Unsafe resource path" }
                        require(seen.add(relative)) { "Duplicate ZIP entry" }
                        check(++count <= 30000) { "Too many resources" }
                        val target = File(staging, relative)
                        require(target.canonicalPath.startsWith(prefix)) { "Resource path escaped staging" }
                        if (entry.isDirectory) {
                            check(target.isDirectory || target.mkdirs()) { "Cannot create directory" }
                        } else {
                            check(target.parentFile!!.isDirectory || target.parentFile!!.mkdirs()) { "Cannot create parent" }
                            target.outputStream().buffered().use { output ->
                                val buffer = ByteArray(64 * 1024)
                                while (true) {
                                    val read = zip.read(buffer)
                                    if (read < 0) break
                                    bytes += read
                                    check(bytes <= MAX_BYTES) { "Resource archive is too large" }
                                    output.write(buffer, 0, read)
                                }
                            }
                        }
                    }
                    zip.closeEntry()
                    entry = zip.nextEntry
                }
            }
            check(File(staging, "docs/index.html").isFile) { "Missing game entry" }
            check(File(staging, "docs/android-compat.js").isFile) { "Missing compatibility scripts" }
            File(staging, ".android-resource-version").writeText(version.toString())
            if (backup.exists()) check(backup.deleteRecursively()) { "Cannot clean old backup" }
            if (active.exists()) check(active.renameTo(backup)) { "Cannot stage previous resources" }
            if (!staging.renameTo(active)) {
                if (backup.exists()) check(backup.renameTo(active)) { "Resource commit and rollback failed" }
                error("Cannot publish new resources")
            }
            // Failure to remove a backup does not invalidate the successfully published game.
            backup.deleteRecursively()
        } catch (error: Exception) {
            staging.deleteRecursively()
            throw error
        }
    }
}
