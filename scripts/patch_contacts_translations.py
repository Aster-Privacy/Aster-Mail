import os, re

BASE = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "i18n", "translations")

patches = {
    "en.ts": ("{{count}} contact(s) deleted", "{{count}} contact(s) starred", "{{count}} contact(s) unstarred"),
    "de.ts": ("{{count}} Kontakt(e) geloscht", "{{count}} Kontakt(e) markiert", "{{count}} Kontakt(e) Markierung entfernt"),
    "es.ts": ("{{count}} contacto(s) eliminado(s)", "{{count}} contacto(s) destacado(s)", "{{count}} contacto(s) sin destacar"),
    "fr.ts": ("{{count}} contact(s) supprime(s)", "{{count}} contact(s) favori(s)", "{{count}} contact(s) retire(s) des favoris"),
    "it.ts": ("{{count}} contatto/i eliminato/i", "{{count}} contatto/i preferito/i", "{{count}} contatto/i rimosso/i dai preferiti"),
    "nl.ts": ("{{count}} contact(en) verwijderd", "{{count}} contact(en) met ster", "{{count}} contact(en) ster verwijderd"),
    "pl.ts": ("Usunieto {{count}} kontakt(ow)", "Oznaczono {{count}} kontakt(ow)", "Usunieto oznaczenie {{count}} kontakt(ow)"),
    "pt.ts": ("{{count}} contato(s) excluido(s)", "{{count}} contato(s) marcado(s)", "{{count}} contato(s) desmarcado(s)"),
    "tr.ts": ("{{count}} kisi silindi", "{{count}} kisi yildizlandi", "{{count}} kisinin yildizi kaldirildi"),
    "ru.ts": ("Удалено контактов: {{count}}", "Отмечено контактов: {{count}}", "Снято отметок: {{count}}"),
    "ja.ts": ("{{count}}件の連絡先を削除しました", "{{count}}件の連絡先にスターを付けました", "{{count}}件の連絡先のスターを外しました"),
    "ko.ts": ("{{count}}개 연락처가 삭제되었습니다", "{{count}}개 연락처에 별표 표시됨", "{{count}}개 연락처의 별표 해제됨"),
    "ar.ts": ("تم حذف {{count}} جهة اتصال", "تم تمييز {{count}} جهة اتصال", "تم إلغاء تمييز {{count}} جهة اتصال"),
    "zh-CN.ts": ("已删除 {{count}} 个联系人", "已为 {{count}} 个联系人加星", "已取消 {{count}} 个联系人的加星"),
}

for fname, (deleted, starred, unstarred) in patches.items():
    path = os.path.join(BASE, fname)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if "contacts_deleted" in content:
        print("SKIP " + fname)
        continue
    needle = re.compile(r'^(\s*)failed_to_delete_contacts:\s*"[^"]*",\s*$', re.MULTILINE)
    m = needle.search(content)
    if not m:
        print("MISS " + fname)
        continue
    indent = m.group(1)
    insertion = (
        "\n" + indent + 'contacts_deleted: "' + deleted + '",'
        + "\n" + indent + 'contacts_starred: "' + starred + '",'
        + "\n" + indent + 'contacts_unstarred: "' + unstarred + '",'
    )
    new_content = content[:m.end()] + insertion + content[m.end():]
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("OK " + fname)
