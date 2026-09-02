//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export const fr = {
  common: {
    delete_folder_account_password: "Mot de passe du compte",
    delete_folder_step_up_hint:
      "Ce dossier est protégé par un mot de passe. Saisissez le mot de passe de votre compte pour le supprimer.",
    delete_folder_totp_code: "Code d'authentification à deux facteurs",
    delete_folder_purge_option:
      "Détruire définitivement les messages qu'il contient",
    delete_folder_purge_warning:
      "Les messages purgés sont détruits sur tous les appareils et ne peuvent pas être récupérés.",
    delete_folder_purge_acknowledge:
      "Je comprends que ces messages ne pourront pas être récupérés.",
    delete_folder_purged_items:
      "Dossier supprimé et {count} messages détruits définitivement.",
    delete_folder_deleted_no_purge:
      "Dossier supprimé. Les messages qu'il contenait restent dans votre compte.",
    delete_folder_password_required:
      "Saisissez le mot de passe de votre compte.",
    delete_folder_totp_required:
      "Saisissez votre code d'authentification à deux facteurs.",
    delete_folder_verification_failed:
      "Vérifiez votre mot de passe et votre code, puis réessayez.",
    qr_code: "Code QR",
    profile_picture_removed: "Photo de profil supprimée",
    failed_remove_profile_picture:
      "Votre photo de profil n'a pas pu être supprimée. Une nouvelle tentative devrait fonctionner.",
    remove_photo: "Supprimer la photo",
    toggle_alias: "Activer ou désactiver cet alias",
    enter_passphrase: "Saisissez votre phrase secrète",
    app_name: "Aster Mail",
    loading_stuck: "Cela prend plus de temps que d'habitude",
    reload_page: "Recharger",
    loading: "Chargement...",
    save: "Enregistrer",
    cancel: "Annuler",
    delete: "Supprimer",
    edit: "Modifier",
    create: "Créer",
    search: "Rechercher",
    close: "Fermer",
    confirm: "Confirmer",
    contact_support: "Contacter l'assistance",
    back: "Retour",
    next: "Suivant",
    previous: "Précédent",
    done: "Terminé",
    yes: "Oui",
    no: "Non",
    ok: "OK",
    retry: "Réessayer",
    refresh: "Actualiser",
    copy: "Copier",
    copied: "Copié",
    inactive: "Inactif",
    download: "Télécharger",
    upload: "Téléverser",
    unsupported_image_type:
      "Ce type de fichier n'est pas pris en charge. Enregistrer l'image en PNG, JPEG, WebP ou GIF fera l'affaire.",
    csv_too_large:
      "Ce CSV contient plus de 10 000 lignes. Le diviser en fichiers plus petits et importer chacun les fera tous entrer.",
    export: "Exporter",
    import: "Importer",
    select_all: "Tout sélectionner",
    deselect_all: "Tout désélectionner",
    no_results: "Aucun résultat trouvé",
    show_more: "Afficher plus",
    show_less: "Afficher moins",
    contacts: "Contacts",
    send_feedback: "Envoyer un commentaire",
    send_feedback_to_aster: "Envoyer un commentaire à Aster",
    folders: "Dossiers",
    add_to_folders: "Ajouter aux dossiers",
    more: "Plus",
    mail: "Courrier",
    labels: "Libellés",
    no_folders_yet: "Aucun dossier pour le moment",
    no_labels_yet: "Aucun libellé pour le moment",
    aliases: "Alias",
    no_aliases_yet: "Pas encore d'alias",
    storage_used: "Stockage utilisé",
    storage_under_one_percent: "< 1 %",
    upgrade: "Mettre à niveau",
    of: "de",
    page: "Page",
    aster_mail: "Aster Mail",
    aster_account: "Mon compte Aster",
    deck: "Tableau de bord de {{name}}",
    workspace_title: "Espace de travail de {{name}} | Aster Mail",
    create_folder: "Créer un dossier",
    create_label: "Créer un libellé",
    more_folders: "{{count}} dossiers de plus",
    more_labels: "{{count}} libellés de plus",
    saved: "Enregistré",
    settings_not_saved: "Non enregistré",
    saving: "Enregistrement...",
    searching: "Recherche en cours...",
    update: "Mettre à jour",
    add: "Ajouter",
    resend: "Renvoyer",
    verified: "Vérifié",
    not_verified: "Non vérifié",
    reset_all_settings: "Réinitialiser tous les paramètres",
    restore_defaults_description:
      "Restaurer toutes les préférences à leurs valeurs par défaut",
    reset_confirm_message:
      "Êtes-vous sûr de vouloir réinitialiser tous les paramètres ? Cela restaurera toutes vos préférences à leurs valeurs par défaut.",
    all_settings_reset: "Tous les paramètres ont été réinitialisés",
    delete_account: "Supprimer le compte",
    erase_all_data: "Effacer définitivement tout votre contenu et vos données",
    display_name_visible:
      "Le nom que les autres membres de votre espace de travail verront",
    inactivity_window: "Délai d’inactivité",
    inactivity_window_description:
      "Les comptes gratuits inactifs pendant ce nombre de mois seront définitivement supprimés. Les avertissements sont envoyés dans votre boîte Aster et à votre e-mail de récupération.",
    inactivity_window_info_title: "Fonctionnement de la politique d’inactivité",
    inactivity_window_info_description:
      "If your account has no activity for the duration you set, it will be permanently deleted. Activity includes signing in from any client - web, desktop, mobile, or the bridge. You will receive warning emails after {{first}}, {{second}}, and {{final}} of inactivity.",
    inactivity_window_step_up_description:
      "Pour votre sécurité, confirmez votre mot de passe pour modifier le délai d’inactivité.",
    inactivity_window_months: "{{n}} mois",
    inactivity_window_saved: "Délai d’inactivité mis à jour",
    inactivity_window_save_failed:
      "Impossible d’enregistrer le délai d’inactivité. Réessayez.",
    recovery_email: "Adresse e-mail de récupération",
    recovery_email_description:
      "C'est l'adresse e-mail utilisée pour récupérer votre compte",
    recovery_email_modal_description:
      "Cette adresse e-mail sera utilisée pour récupérer votre compte si vous perdez l'accès.",
    enter_recovery_email: "Saisir l'e-mail de récupération",
    enter_valid_email: "Saisir un e-mail valide",
    failed_to_save:
      "Vos modifications ne se sont pas enregistrées. Vérifier votre connexion et réessayer suffit en général. La version précédente est toujours là.",
    verification_sent:
      "E-mail de vérification envoyé à {{email}}. Vérifiez votre boîte de réception et cliquez sur le lien pour vérifier.",
    verification_email_sent: "E-mail de vérification envoyé",
    failed_verification_email:
      "Nous n'avons pas pu envoyer le courriel de vérification tout de suite. Un autre essai dans un instant suffit en général. Votre compte est inchangé.",
    profile_picture_updated: "Photo de profil mise à jour",
    failed_save_profile_picture:
      "Votre nouvelle photo de profil ne s'est pas enregistrée. Un autre essai devrait suffire. L'ancienne photo s'affiche toujours.",
    failed_upload_image:
      "Le téléversement ne s'est pas terminé. Un autre essai devrait suffire.",
    valid_image_error:
      "Ce fichier n'est pas une image prise en charge. Un JPEG, PNG ou WebP fonctionnera.",
    image_size_error:
      "Cette image dépasse la limite de 5 Mo. Une plus petite, ou une version compressée, passera.",
    recovery_conflict:
      "Cette adresse protège déjà le maximum de 20 comptes Aster. Utilisez une autre adresse.",
    copied_to_clipboard: "Copié dans le presse-papiers",
    address_copied_to_clipboard: "Adresse copiée dans le presse-papiers",
    offline: "Hors ligne",
    offline_features_limited:
      "Vous êtes hors ligne pour l'instant. Certaines fonctionnalités ne marcheront pas tant que vous ne serez pas reconnecté.",
    back_online: "De retour en ligne",
    dont_ask_again: "Ne plus demander",
    enable: "Activer",
    test: "Tester",
    preview: "Aperçu",
    general: "Général",
    name: "Nom",
    description: "Description",
    color: "Couleur",
    rename: "Renommer",
    remove: "Retirer",
    apply: "Appliquer",
    manage: "Gérer",
    undo: "Annuler",
    send_now: "Envoyer maintenant",
    now: "Maintenant",
    saved_on_date: "Enregistré le {{ date }}",
    saved_at_time: "Enregistré à {{ time }}",
    in_n_minutes_plural: "Dans {{ count }} minutes",
    in_n_minutes: "Dans {{ count }} minute",
    label_already_exists:
      "Vous avez déjà une étiquette portant ce nom. Un autre nom devrait fonctionner.",
    label_name_too_long:
      "Les noms d'étiquette sont limités à {{max}} caractères. Un nom plus court s'enregistrera.",
    folder_already_exists:
      "Vous avez déjà un dossier portant ce nom. Un autre nom devrait fonctionner.",
    folder_name_too_long:
      "Les noms de dossier sont limités à {{max}} caractères. Un nom plus court s'enregistrera.",
    unsubscribe_link_available: "Lien de désabonnement disponible",
    email_unsubscribe_available: "Désabonnement par e-mail disponible",
    one_click_unsubscribe_available: "Désabonnement en un clic disponible",
    unsubscribe_error_manual:
      "Nous n'avons pas pu vous désabonner. Ouvrir le lien vous emmènera sur le site de l'expéditeur pour vous désabonner vous-même.",
    unsubscribed_successfully: "Désabonnement réussi",
    expand_all: "Tout développer",
    collapse_all: "Tout réduire",
    delete_folder_confirm: "Voulez-vous vraiment supprimer le dossier",
    delete_folder_subfolders:
      " Les sous-dossiers seront déplacés vers le niveau supérieur.",
    delete_folder_warning:
      "Ce dossier sera retiré, et vous ne pouvez pas annuler cette action. Les messages à l'intérieur restent dans votre compte, ils ne seront simplement plus classés dans ce dossier.",
    select_a_color: "Sélectionner une couleur",
    change_folder_color: "Modifier la couleur du dossier",
    folder_name: "Nom du dossier",
    rename_folder_description: "Saisir un nouveau nom pour ce dossier",
    rename_folder: "Renommer le dossier",
    move_folder: "Déplacer le dossier",
    move_folder_description: "Choisir un nouveau dossier parent",
    select_parent_folder: "Sélectionner le dossier parent",
    top_level_no_parent: "Niveau supérieur (sans parent)",
    parent_folder: "Dossier parent",
    move_up: "Monter",
    move_down: "Descendre",
    move_to: "Déplacer vers",
    lock_extra_security:
      "Le verrouillage ajoute une sécurité supplémentaire au chiffrement existant. Vous pouvez le déverrouiller à tout moment.",
    unlock_folder_description:
      "Le dossier sera déverrouillé et la couche de protection supplémentaire retirée. Vos données restent chiffrées avec le chiffrement standard.",
    lock_folder_description:
      "Vos données sont déjà chiffrées. Verrouiller ce dossier ajoute une couche de chiffrement supplémentaire et exige une authentification en plus pour accéder à son contenu.",
    extra_protection_layer: "Couche de protection supplémentaire",
    lock_folder: "Verrouiller le dossier",
    unlock_folder: "Déverrouiller le dossier",
    cancel_scheduled: "Annuler la planification",
    edit_reschedule: "Modifier et reprogrammer",
    reschedule: "Reprogrammer",
    send_time_updated: "Heure d'envoi mise à jour",
    delete_folder: "Supprimer le dossier",
    change_color: "Modifier la couleur",
    change_icon: "Changer l'icône",
    more_information: "Plus d'informations",
    lock: "Verrouiller",
    remove_lock: "Retirer le verrou",
    create_subfolder: "Créer un sous-dossier",
    mute_notifications: "Désactiver les notifications",
    unmute_notifications: "Réactiver les notifications",
    new_message: "Nouveau message",
    expand: "Agrandir",
    minimize: "Réduire",
    fullscreen: "Plein écran",
    exit_fullscreen: "Quitter le plein écran",
    delete_draft: "Supprimer le brouillon",
    remove_formatting: "Supprimer la mise en forme",
    remove_formatting_warning:
      "Passer en texte brut retire toute la mise en forme de ce brouillon, et le compositeur ne peut pas la ramener. Vos autres brouillons ne sont pas affectés.",
    seconds: "secondes",
    password_protected: "Protégé par mot de passe",
    open_menu: "Ouvrir le menu",
    collapse_sidebar: "Réduire la barre latérale",
    expand_sidebar: "Développer la barre latérale",
    close_menu: "Fermer le menu",
    keyboard_shortcuts: "Raccourcis clavier",
    skip_to_content: "Aller au contenu principal",
    main_navigation: "Navigation principale",
    enable_shortcuts: "Activer les raccourcis",
    shortcuts_disabled_message:
      "Les raccourcis clavier sont actuellement désactivés. Activez-les dans Paramètres > Accessibilité pour utiliser les raccourcis.",
    navigation: "Navigation",
    actions: "Actions",
    global: "Mondial",
    search_emojis: "Rechercher des émojis...",
    skin_tone: "Teinte de peau",
    wrap: "Renvoyer à la ligne",
    unwrap: "Ne pas renvoyer à la ligne",
    source_copied_to_clipboard: "Source copiée dans le presse-papiers",
    phone: "Téléphone",
    company: "Entreprise",
    street: "Rue",
    city: "Ville",
    state: "État/Région",
    country: "Pays",
    birthday: "Anniversaire",
    notes: "Notes",
    hide_notes: "Masquer les notes",
    favorite: "Favori",
    favorited: "Favori",
    added_to_favorites: "Ajouté aux favoris",
    removed_from_favorites: "Retiré des favoris",
    favorites: "Favoris",
    has_email: "A un e-mail",
    has_phone: "A un téléphone",
    has_company: "A une entreprise",
    recently_added: "Ajouté récemment",
    sort: "Trier",
    delete_contact: "Supprimer le contact",
    delete_selected_contacts: "Supprimer les contacts sélectionnés",
    search_contacts: "Rechercher des contacts...",
    later_today: "Plus tard aujourd'hui",
    tomorrow: "Demain",
    this_weekend: "Ce week-end",
    next_week: "La semaine prochaine",
    next_month: "Le mois prochain",
    tomorrow_morning: "Demain matin",
    in_one_hour: "Dans une heure",
    tonight: "Ce soir",
    tomorrow_afternoon: "Demain après-midi",
    monday_morning: "Lundi matin",
    search_senders: "Rechercher des expéditeurs...",
    no_senders_found: "Aucun expéditeur trouvé",
    no_emails_to_process: "Aucun e-mail à traiter",
    archive_emails_from_sender: "Archiver les e-mails de l'expéditeur",
    delete_emails_from_sender: "Supprimer les e-mails de l'expéditeur",
    move_emails_from_sender: "Déplacer les e-mails de l'expéditeur",
    compose_new_email: "Rédiger un nouvel e-mail",
    refresh_inbox: "Actualiser la boîte de réception",
    inbox_refreshed: "Boîte de réception actualisée",
    upgrade_plan: "Mettre à niveau le forfait",
    alias_limit_reached: "Limite d'alias atteinte",
    delete_alias: "Supprimer l'alias",
    delete_domain: "Supprimer le domaine",
    delete_address: "Supprimer l'adresse",
    copy_address: "Copier l'adresse",
    copy_value: "Copier la valeur",
    enter_password_prompt: "Saisir le mot de passe",
    two_fa_code_placeholder: "Code 2FA à 6 chiffres",
    export_private_key: "Exporter la clé privée",
    regenerate_recovery_codes: "Régénérer les codes de récupération",
    search_index: "Index de recherche",
    all_emails_and_conversations: "Tous les e-mails et conversations",
    delete_imported_emails: "Supprimer les e-mails importés ?",
    deleting: "Suppression...",
    delete_mail: "Supprimer le courrier",
    search_forwarding_rules: "Rechercher des règles de transfert...",
    search_allowlist: "Rechercher dans la liste autorisée...",
    search_blocked_senders: "Rechercher des expéditeurs bloqués...",
    enter_email_to_block: "Saisir l'adresse e-mail à bloquer...",
    am: "AM",
    pm: "PM",
    twitter: "Twitter",
    verifying: "Vérification...",
    continue: "Continuer",
    processing: "Traitement...",
    action_cannot_be_undone: "Cette action ne peut pas être annulée.",
    discard_changes_title: "Abandonner les modifications ?",
    discard_changes_message:
      "Vos modifications n'ont pas été enregistrées. Si vous fermez maintenant, vous les perdez.",
    select_placeholder: "Sélectionner...",
    processing_count: "Traitement de {{completed}} sur {{total}}...",
    add_to_contacts: "Ajouter aux contacts",
    work: "Travail",
    personal: "Personnel",
    family: "Famille",
    other: "Autre",
    basic: "Basique",
    details: "Détails",
    address: "Adresse",
    social: "Réseaux sociaux",
    photo: "Photo",
    files: "Fichiers",
    fields: "Champs",
    first_name: "Prénom",
    last_name: "Nom de famille",
    email: "E-mail",
    job_title: "Titre du poste",
    postal_code: "Code postal",
    website: "Site web",
    first_name_placeholder: "Jean",
    last_name_placeholder: "Dupont",
    middle_name: "Deuxième prénom",
    title: "Titre",
    name_suffix: "Suffixe du nom",
    phonetic_first_name: "Prénom phonétique",
    phonetic_middle_name: "Deuxième prénom phonétique",
    phonetic_last_name: "Nom de famille phonétique",
    nickname: "Surnom",
    role: "Rôle",
    department: "Département",
    comment: "Commentaire",
    pronouns: "Pronoms",
    dates: "Dates",
    related_people: "Personnes liées",
    social_networks: "Réseaux sociaux",
    websites: "Sites web",
    instant_messengers: "Messageries instantanées",
    add_more: "Ajouter un autre",
    hide: "Masquer",
    username: "Nom d'utilisateur",
    identity: "Identité",
    communication: "Communication",
    web_security: "Web et sécurité",
    type_home: "Domicile",
    type_work: "Professionnel",
    type_other: "Autre",
    type_mobile: "Mobile",
    type_fax: "Fax",
    type_pager: "Téléavertisseur",
    type_anniversary: "Anniversaire",
    type_graduation: "Remise de diplôme",
    type_wedding: "Mariage",
    type_assistant: "Assistant",
    type_manager: "Responsable",
    type_spouse: "Conjoint",
    type_partner: "Partenaire",
    type_child: "Enfant",
    type_parent: "Parent",
    type_sibling: "Frère ou sœur",
    type_friend: "Ami",
    type_twitter: "X (Twitter)",
    type_linkedin: "LinkedIn",
    type_github: "GitHub",
    type_instagram: "Instagram",
    type_facebook: "Facebook",
    type_mastodon: "Mastodon",
    type_bluesky: "Bluesky",
    type_private: "Privé",
    type_blog: "Blog",
    type_signal: "Signal",
    type_matrix: "Matrix",
    type_telegram: "Telegram",
    type_whatsapp: "WhatsApp",
    type_xmpp: "XMPP",
    email_placeholder: "email@exemple.com",
    phone_placeholder: "+33 1 23 45 67 89",
    company_placeholder: "Acme SAS",
    job_title_placeholder: "Ingénieur logiciel",
    notes_placeholder: "Ajouter des notes à propos de ce contact...",
    address_placeholder: "123 Rue Principale",
    city_placeholder: "Paris",
    state_placeholder: "Île-de-France",
    postal_code_placeholder: "75001",
    country_placeholder: "France",
    website_placeholder: "https://exemple.com",
    delete_contact_confirmation:
      "Êtes-vous sûr de vouloir supprimer {{name}} ? Cette action est irréversible.",
    delete_contacts_confirmation:
      "Êtes-vous sûr de vouloir supprimer {{count}} contact(s) ? Cette action est irréversible.",
    add_new_field_type: "Ajouter un nouveau type de champ",
    field_name_placeholder: "Nom du champ...",
    skip: "Passer",
    add_carddav: "Ajouter CardDAV",
    add_carddav_server: "Ajouter un serveur CardDAV",
    carddav_name_placeholder: "Mon Nextcloud",
    carddav_url_placeholder: "https://cloud.exemple.com/remote.php/dav",
    carddav_username_placeholder: "utilisateur@exemple.com",
    carddav_password_placeholder:
      "Mot de passe d'application ou mot de passe habituel",
    password_strength_weak: "Faible",
    password_strength_fair: "Moyen",
    password_strength_strong: "Fort",
    password_strength_very_secure: "Très sécurisé",
    pending_email_notifications: "Notifications d'e-mails en attente",
    selected: "sélectionné(s)",
    are_you_sure: "Êtes-vous sûr ?",
    sign_out_all_confirmation:
      "Voulez-vous vraiment vous déconnecter de tous les comptes sur cet appareil ?",
    sign_out_confirmation:
      "Êtes-vous sûr de vouloir vous déconnecter de votre compte ?",
    remove_account_confirmation:
      "Voulez-vous vraiment retirer ce compte ? Vous pourrez l’ajouter à nouveau plus tard.",
    go_back: "Retour",
    continue_anyway: "Continuer quand même",
    set_as_default: "Définir par défaut",
    billing_alert_body:
      "Votre paiement n'a pas abouti. L'accès sera bientôt limité.",
    billing_alert_body_days:
      "Votre paiement n'a pas abouti. L'accès sera limité dans {{days}} jours.",
    billing_alert_action: "Payer",
    dismiss: "Ignorer",
    load_content: "Charger",
    open_link: "Ouvrir le lien",
    no_icon: "Pas d'icône",
    icon_group_essentials: "Essentiels",
    icon_group_mail: "Courrier",
    icon_group_money: "Argent",
    icon_group_work: "Travail",
    icon_group_school: "École",
    color_red: "Rouge",
    color_orange: "Orange",
    color_amber: "Ambre",
    color_yellow: "Jaune",
    color_lime: "Citron vert",
    color_green: "Vert",
    color_emerald: "Émeraude",
    color_teal: "Sarcelle",
    color_cyan: "Cyan",
    color_sky: "Ciel",
    color_blue: "Bleu",
    color_indigo: "Indigo",
    color_violet: "Violet",
    color_purple: "Pourpre",
    color_fuchsia: "Fuchsia",
    color_pink: "Rose",
    color_rose: "Vieux rose",
    tag_icon_tag: "Étiquette",
    tag_icon_folder: "Dossier",
    tag_icon_star: "Étoile",
    tag_icon_bookmark: "Signet",
    tag_icon_flag: "Drapeau",
    tag_icon_check: "Coche",
    tag_icon_bell: "Cloche",
    tag_icon_heart: "Cœur",
    tag_icon_sparkles: "Étincelles",
    tag_icon_fire: "Feu",
    tag_icon_bolt: "Éclair",
    tag_icon_clock: "Horloge",
    tag_icon_info: "Info",
    tag_icon_warning: "Avertissement",
    tag_icon_envelope: "Enveloppe",
    tag_icon_at: "Arobase",
    tag_icon_chat: "Discussion",
    tag_icon_send: "Envoyer",
    tag_icon_draft: "Brouillon",
    tag_icon_document: "Document",
    tag_icon_archive: "Archive",
    tag_icon_trash: "Corbeille",
    tag_icon_shield: "Bouclier",
    tag_icon_lock: "Cadenas",
    tag_icon_eye_slash: "Masqué",
    tag_icon_currency: "Devise",
    tag_icon_money: "Argent",
    tag_icon_bank: "Banque",
    tag_icon_card: "Carte",
    tag_icon_wallet: "Portefeuille",
    tag_icon_receipt: "Reçu",
    tag_icon_chart: "Graphique",
    tag_icon_cart: "Panier",
    tag_icon_gift: "Cadeau",
    tag_icon_ticket: "Billet",
    tag_icon_crypto: "Crypto",
    tag_icon_briefcase: "Mallette",
    tag_icon_building: "Bâtiment",
    tag_icon_user: "Personne",
    tag_icon_users: "Personnes",
    tag_icon_calendar: "Calendrier",
    tag_icon_clipboard: "Presse-papiers",
    tag_icon_presentation: "Présentation",
    tag_icon_trophy: "Trophée",
    tag_icon_code: "Code",
    tag_icon_key: "Clé",
    tag_icon_link: "Lien",
    tag_icon_package: "Colis",
    tag_icon_home: "Accueil",
    tag_icon_truck: "Camion",
    tag_icon_map_pin: "Repère de carte",
    tag_icon_camera: "Appareil photo",
    tag_icon_music: "Musique",
    tag_icon_cloud: "Nuage",
    tag_icon_sun: "Soleil",
    tag_icon_moon: "Lune",
    tag_icon_globe: "Globe",
    tag_icon_phone: "Téléphone",
    tag_icon_news: "Actualités",
    tag_icon_bulb: "Ampoule",
    tag_icon_tools: "Outils",
    tag_icon_ban: "Bloqué",
    icon_group_everyday: "Quotidien",
    random: "Aléatoire",
    custom: "Personnalisé",
    standard: "Standard",
    host: "Hôte",
    value: "Valeur",
    priority: "Priorité",
    instructions: "Consignes",
    tip: "Astuce",
    step_x_of_y: "Étape {{current}} sur {{total}}",
    not_detected: "Non détecté",
    navigate: "Naviguer",
    commands_count: "{{count}} commandes",
    no_commands_found: "Aucune commande trouvée",
    type_command_or_search: "Saisir une commande ou rechercher...",
    failed_to_load_emails:
      "Votre boîte de réception ne s'est pas chargée. Tirer pour actualiser, ou un autre essai, suffit en général. Votre courrier sur le serveur est en sécurité.",
    no_emails_match_criteria: "Aucun e-mail ne correspond à ce critère",
    failed_to_update_emails:
      "Ces modifications ne se sont pas enregistrées. Un autre essai devrait suffire. Les messages eux-mêmes sont inchangés.",
    failed_to_archive_emails:
      "L'archivage ne s'est pas terminé. Un autre essai devrait suffire. Les messages sont toujours dans votre boîte de réception.",
    failed_to_unarchive_emails:
      "Le déplacement vers la boîte de réception ne s'est pas terminé. Un autre essai devrait suffire. Les messages sont toujours archivés.",
    keyboard_shortcut_label: "Raccourci clavier : {shortcut}",
    something_went_wrong_try_again:
      "Cela n'a pas fonctionné. Un autre essai dans un instant suffit en général.",
    something_went_wrong: "Une erreur est survenue.",
    phishing_confirm_text: "je comprends les risques",
    phishing_confirm_placeholder:
      'Tapez "I understand the risks" pour réactiver les liens.',
    enter_field_value: "Saisir {{field}}...",
    composer_load_error:
      "Le compositeur ne s'est pas chargé. Fermer cette fenêtre et la rouvrir suffit en général. Votre brouillon est enregistré.",
    unable_to_load_composer: "Le compositeur ne s'est pas chargé.",
    email_render_error:
      "Nous n'avons pas pu afficher ce message sur cet appareil. L'ouvrir à nouveau, ou consulter la source brute, suffit en général. Votre boîte de réception n'est pas affectée.",
    unable_to_display_email:
      "Nous ne pouvons pas afficher ce message pour l'instant.",
    error_details: "Détails de l'erreur",
    view_status: "Voir l'état",
    try_again: "Réessayer",
    unexpected_error_refresh:
      "Une erreur s'est produite, veuillez actualiser la page pour continuer.",
    unsupported_browser: "Navigateur non pris en charge.",
    unsupported_browser_detail: "Veuillez essayer un autre navigateur.",
    and: "et",
    emails_marked_as_read: "{{count}} e-mail(s) marqué(s) comme lu(s)",
    emails_archived: "{{count}} e-mail(s) archivé(s)",
    emails_moved_to_trash: "{{count}} e-mail(s) déplacé(s) vers la corbeille",
    emails_starred: "{{count}} e-mail(s) marqué(s) d'une étoile",
    emails_unstarred: "{{count}} e-mail(s) sans étoile",
    emails_permanently_deleted:
      "{{count}} e-mail(s) supprimé(s) définitivement",
    drafts_deleted: "{{count}} brouillon(s) supprimé(s) définitivement",
    spam_emails_moved_to_trash:
      "{{count}} e-mail(s) indésirable(s) déplacé(s) vers la corbeille",
    trash_already_empty: "La corbeille est déjà vide",
    remaining: "restant(s)",
    creating: "Création...",
    adding: "Ajout...",
    checking: "Vérification...",
    host_name: "Nom d'hôte",
    dns_required: "Obligatoire",
    dns_recommended: "Recommande",
    dns_caveat_mx_replaces_existing:
      "Ceci remplace les enregistrements MX existants. Supprimez les MX de votre ancien fournisseur de messagerie, sinon les nouveaux messages n'arriveront pas chez Aster.",
    dns_caveat_spf_single_record_other_senders:
      "Ne publiez qu'un seul enregistrement SPF. Si d'autres services envoient du courrier pour ce domaine, fusionnez leurs termes include: dans cet unique enregistrement.",
    dns_caveat_dmarc_add_after_spf_dkim:
      "Ajoutez ceci en dernier, une fois SPF et DKIM verifies. Le publier trop tot peut envoyer vos propres messages en spam.",
    value_points_to: "Valeur / Pointe vers",
    dns_records_to_add: "Enregistrements DNS à ajouter",
    dns_propagation_note:
      "Les modifications DNS peuvent prendre jusqu'à 48 heures pour se propager",
    close_verify_later: "Fermer et vérifier plus tard",
    post: "Publier",
    link_copied: "Lien copié dans le presse-papiers",
    code_copied: "Code copié",
    invite_sent: "Invitation envoyée !",
    no_contacts_with_emails: "Aucun contact avec adresse e-mail trouvé",
    join_aster_secure_email: "Rejoignez-moi sur Aster: Messagerie sécurisée",
    email_sent: "E-mail envoyé.",
    undo_send_too_late:
      "Ce message a déjà été envoyé et ne peut pas être rappelé.",
    email_sent_successfully: "E-mail envoyé avec succès",
    scheduled_email_cancelled: "E-mail programmé annulé",
    email_snoozed: "E-mail mis en veille",
    email_unsnoozed: "E-mail sorti de la veille",
    failed_to_snooze:
      "Ce message n'a pas été mis en veille. Un autre essai devrait suffire. Il est toujours dans votre boîte de réception.",
    failed_to_unsnooze:
      "Ce message n'est pas revenu dans votre boîte de réception. Un autre essai devrait suffire.",
    conversation_moved_to_trash: "Conversation déplacée vers la corbeille",
    conversation_archived: "Conversation archivée",
    conversation_marked_as_spam: "Conversation marquée comme indésirable",
    failed_to_mark_as_spam:
      "Ce message n'a pas été déplacé vers les indésirables. Un autre essai devrait suffire.",
    failed_to_snooze_conversations:
      "Ces conversations n'ont pas été mises en veille. Un autre essai devrait suffire.",
    marked_as_read_toast: "Marqué comme lu",
    marked_as_unread_toast: "Marqué comme non lu",
    email_permanently_deleted: "E-mail supprimé définitivement",
    pinned_toast: "Épinglé",
    unpinned_toast: "Désépinglé",
    starred_toast: "Étoile ajoutée",
    unstarred_toast: "Étoile retirée",
    restored_from_trash: "Restauré depuis la corbeille",
    marked_as_not_spam: "Marqué comme non indésirable",
    moved_to_inbox_toast: "Déplacé vers la boîte de réception",
    copied_successfully: "Copié avec succès",
    unlock: "Déverrouiller",
    regenerate: "Régénérer",
    recipient: "Destinataire",
    sending_soon: "Envoi imminent...",
    in_x_minutes: "Dans {{count}} minute(s)",
    never: "Jamais",
    just_now: "À l'instant",
    months_ago_long: "il y a {{count}} mois",
    weeks_ago_long: "il y a {{count}} semaine(s)",
    days_ago_long: "il y a {{count}} jour(s)",
    hours_ago_long: "il y a {{count}} heure(s)",
    minutes_ago_long: "il y a {{count}} minute(s)",
    x_days_ago: "il y a {{count}} jours",
    years_ago_short: "il y a {{count}} an",
    months_ago_short: "il y a {{count}} mois",
    weeks_ago_short: "il y a {{count}} sem.",
    days_ago_short: "il y a {{count}} j",
    hours_ago_short: "il y a {{count}} h",
    minutes_ago_short: "il y a {{count}} min",
    weeks_remaining: "{{count}} semaine(s) restante(s)",
    days_remaining: "{{count}} jour(s) restant(s)",
    hours_remaining: "{{count}} heure(s) restante(s)",
    minutes_remaining: "{{count}} minute(s) restante(s)",
    snooze_expired: "La mise en veille de ce message s'est terminée.",
    date_at_time: "{{date}} à {{time}}",
    tomorrow_at_time: "Demain à {{time}}",
    yesterday_at_time: "Hier à {{time}}",
    today_at_time: "Aujourd'hui à {{time}}",
    yesterday: "Hier",
    today: "Aujourd'hui",
    active: "Actif",
    paused: "En pause",
    unnamed_contact: "Contact sans nom",
    unnamed: "Sans nom",
    no_name: "Pas de nom",
    same_email: "Même e-mail",
    similar_name: "Nom similaire",
    same_phone: "Même téléphone",
    possible_duplicate: "Doublon possible",
    add_server: "Ajouter un serveur",
    unknown: "Inconnu",
    text_type: "Texte",
    date_type: "Date",
    number_type: "Nombre",
    phone_type: "Téléphone",
    email_type: "E-mail",
    failed_to_fetch_contacts:
      "Vos contacts ne se sont pas chargés. Un autre essai devrait suffire. Vos contacts enregistrés sont en sécurité.",
    failed_to_delete_contact:
      "Ce contact n'a pas été retiré. Un autre essai devrait suffire.",
    contact_deleted: "Contact supprimé",
    contact_saved: "Contact enregistré",
    contact_created: "Contact créé",
    failed_to_create_contact:
      "Ce contact ne s'est pas enregistré. Un autre essai devrait suffire.",
    failed_to_save_contact:
      "Vos modifications sur ce contact ne se sont pas enregistrées. Un autre essai devrait suffire. La version précédente est toujours là.",
    failed_to_delete_contacts:
      "Ces contacts n'ont pas été retirés. Un autre essai devrait suffire.",
    failed_to_update_favorites:
      "Vos favoris ne se sont pas mis à jour. Un autre essai devrait suffire.",
    contacts_import_partial:
      "Seuls {{imported}} contacts sur {{total}} ont été importés. Importez de nouveau le fichier pour ajouter les autres.",
    failed_to_import_contacts:
      "L'import des contacts ne s'est pas terminé. Un autre essai devrait suffire. Vos contacts existants sont inchangés.",
    failed_to_read_file:
      "Ce fichier n'a pas pu être lu. Un autre fonctionnera.",
    import_failed:
      "L'import ne s'est pas terminé. Un autre essai devrait suffire. Vos données existantes sont inchangées.",
    failed_to_load_duplicates:
      "La liste des doublons ne s'est pas chargée. Un autre essai devrait suffire.",
    scan_failed:
      "L'analyse ne s'est pas terminée. Un autre essai devrait suffire.",
    dismiss_failed:
      "Nous n'avons pas pu rejeter cela. Un autre essai devrait suffire.",
    failed_to_load_custom_fields:
      "Ces champs personnalisés ne se sont pas chargés. Un autre essai devrait suffire.",
    failed_to_create_field:
      "Ce champ personnalisé ne s'est pas enregistré. Un autre essai devrait suffire.",
    delete_custom_field_title: "Delete custom field?",
    delete_custom_field_message:
      "Deleting this field also removes its values from every contact. You cannot undo this.",
    failed_to_delete_field:
      "Ce champ personnalisé n'a pas été retiré. Un autre essai devrait suffire.",
    failed_to_save_value:
      "Votre modification ne s'est pas enregistrée. Un autre essai devrait suffire. La valeur précédente est toujours là.",
    click_scan_duplicates: 'Cliquez sur "Analyser" pour vérifier les doublons',
    never_synced: "Jamais synchronisé",
    last_sync_successful: "Dernière synchronisation réussie",
    last_sync_failed:
      "La dernière synchronisation ne s'est pas terminée, et nous réessaierons automatiquement.",
    failed_to_forward:
      "Le transfert ne s'est pas envoyé. Un autre essai devrait suffire. Votre brouillon est enregistré.",
    failed_to_schedule:
      "La programmation ne s'est pas enregistrée. Un autre essai devrait suffire. Votre brouillon est en sécurité.",
    fill_required_fields: "Veuillez remplir tous les champs obligatoires",
    failed_to_load_sources:
      "Vos comptes synchronisés ne se sont pas chargés. Un autre essai devrait suffire. Les comptes eux-mêmes ne sont pas affectés.",
    failed_to_add_source:
      "Ce compte n'a pas été ajouté. Un autre essai devrait suffire.",
    failed_to_delete_source:
      "Ce compte n'a pas été retiré. Un autre essai devrait suffire.",
    failed_to_toggle_source:
      "Nous n'avons pas pu changer ce réglage. Un autre essai devrait suffire.",
    sync_failed:
      "La synchronisation ne s'est pas terminée, et nous réessaierons automatiquement. Votre courrier de chaque côté est en sécurité.",
    clearing: "Effacement...",
    clear: "Effacer",
    clear_all: "Tout effacer",
    loading_more: "Chargement...",
    verify: "Vérifier",
    add_domain: "Ajouter un domaine",
    removed_from_folder: "Retiré de {{folder}}",
    moved_to_folder: "Déplacé vers {{folder}}",
    removed_label: "Libellé {{label}} retiré",
    added_label: "Libellé {{label}} ajouté",
    spam_emails_permanently_deleted:
      "{{count}} e-mail(s) indésirable(s) supprimé(s) définitivement",
    trash_emptied: "Corbeille vidée avec succès",
    spam_empty_failed:
      "Impossible de vider les spams. Un nouvel essai dans un instant suffit généralement. Rien n’a été supprimé.",
    conversations_marked_as_spam_bulk:
      "{{count}} conversation(s) marquée(s) comme indésirable(s)",
    conversations_restored_bulk: "{{count}} conversation(s) restaurée(s)",
    failed_to_restore_conversations:
      "Ces conversations n'ont pas été restaurées. Un autre essai devrait suffire.",
    conversations_snoozed_bulk: "{{count}} conversation(s) mise(s) en veille",
    conversations_marked_as_read_bulk:
      "{{count}} conversation(s) marquée(s) comme lue(s)",
    conversations_marked_as_unread_bulk:
      "{{count}} conversation(s) marquée(s) comme non lue(s)",
    conversations_removed_from_folder:
      "{{count}} conversation(s) retirée(s) de {{folder}}",
    conversations_moved_to_folder:
      "{{count}} conversation(s) déplacée(s) vers {{folder}}",
    conversations_removed_label:
      "{{count}} conversation(s) : libellé {{label}} retiré",
    conversations_added_label:
      "{{count}} conversation(s) : libellé {{label}} ajouté",
    already_in_folder: "Déjà dans {{folder}}",
    cannot_move_from_view:
      "Vous ne pouvez pas déplacer de messages depuis cette vue.",
    already_has_label: "Déjà étiqueté {{label}}",
    birthday_today: "Aujourd'hui !",
    birthday_tomorrow: "Demain",
    contact_details: "Détails du contact",
    history: "Historique",
    all_mail: "Tous les messages",
    import_contacts: "Importer des contacts",
    import_choose_file_desc:
      "Choisissez un fichier pour importer des contacts. Formats pris en charge : vCard (.vcf) et CSV.",
    click_to_select_file: "Cliquez pour sélectionner un fichier",
    or_drag_and_drop: "ou glisser-déposer",
    vcf_files: "Fichiers .vcf",
    spreadsheet_export: "Export de tableur",
    map_csv_columns: "Associer les colonnes CSV aux champs de contact :",
    import_complete: "Importation terminée",
    contacts_imported_desc: "Vos contacts ont été importés",
    importing: "Importation...",
    imported: "Importé",
    skipped: "Ignoré",
    failed: "Échec",
    disable: "Désactiver",
    sync: "Synchroniser",
    delete_mail_from: "Supprimer le courrier de",
    unknown_time: "heure inconnue",
    relationship: "Relation",
    no_contact_selected: "Aucun contact sélectionné",
    select_contact_hint:
      "Sélectionnez un contact dans la liste pour voir ses détails",
    importing_contacts: "Importation des contacts...",
    export_all: "Tout exporter",
    no_contacts: "Aucun contact",
    failed_to_load_contacts: "Les contacts ne se sont pas chargés.",
    mass_email_limited:
      "Seules les {{count}} premières adresses ont été ajoutées.",
    add_contacts_hint: "Ajoutez des contacts pour commencer",
    add_contact: "Ajouter un contact",
    file_too_large: "Le fichier doit être inférieur à {{size}}",
    failed_to_upload_attachment:
      "Cette pièce jointe ne s'est pas téléversée. Un autre essai devrait suffire. Votre brouillon est enregistré.",
    upload_failed:
      "Le téléversement ne s'est pas terminé. Un autre essai devrait suffire.",
    delete_failed:
      "Cet élément n'a pas été retiré. Un autre essai devrait suffire.",
    download_failed:
      "Ce téléchargement ne s'est pas terminé. Un autre essai devrait suffire.",
    attachment_locked:
      "Cette pièce jointe ne peut pas être ouverte, car sa clé de chiffrement n'est pas disponible sur cet appareil.",
    scheduled_no_attachments:
      "Les e-mails programmés ne peuvent pas encore inclure de pièces jointes. Envoyez maintenant, ou retirez les fichiers pour programmer.",
    scheduled_connected_account:
      "L'envoi programmé n'est pas disponible pour les comptes connectés. Envoie ce message maintenant ou choisis une adresse Aster.",
    scheduled_no_expiry:
      "Les messages programmés ne prennent pas encore en charge l’expiration. Envoyez-le maintenant ou retirez l’expiration pour le programmer.",
    failed_to_merge_contacts:
      "La fusion ne s'est pas terminée. Un autre essai devrait suffire. Vos contacts d'origine sont inchangés.",
    merge_failed:
      "La fusion ne s'est pas terminée. Un autre essai devrait suffire. Vos contacts d'origine sont inchangés.",
    failed_to_load_history:
      "L'historique ne s'est pas chargé. Un autre essai devrait suffire.",
    failed_to_load_more:
      "Nous n'avons pas pu charger plus d'éléments. Un autre essai devrait suffire.",
    enter_valid_emails: "Veuillez saisir des adresses e-mail valides",
    enter_contact_details: "Saisir les détails du contact",
    select_valid_image:
      "Veuillez sélectionner une image JPEG, PNG, WebP ou GIF",
    image_too_large:
      "Cette image dépasse la limite de 10 Mo. Une plus petite, ou une version compressée, passera.",
    failed_to_upload_photo:
      "Cette photo ne s'est pas téléversée. Un autre essai devrait suffire.",
    contact_photo: "Photo du contact",
    failed_to_delete_account:
      "Échec de la suppression du compte. Veuillez réessayer.",
    no_emails_older_than_30_days: "Aucun e-mail de plus de 30 jours",
    no_newsletters_found: "Aucune newsletter trouvée à archiver",
    newsletters_archived: "{{count}} newsletter(s) archivée(s)",
    reported_as_phishing: "Signalé comme hameçonnage",
    pinned_to_top: "Épinglé en haut",
    emails_snoozed_until: "{{count}} e-mail(s) mis en veille jusqu'à {{time}}",
    emails_from_senders_archived: "{{count}} e-mails archivés de {{senders}}",
    emails_from_senders_deleted: "{{count}} e-mails supprimés de {{senders}}",
    emails_added_to_folder: "{{count}} e-mail(s) ajouté(s) à {{folder}}",
    failed_to_snooze_emails:
      "Ces messages n'ont pas été mis en veille. Un autre essai devrait suffire. Ils sont toujours dans votre boîte de réception.",
    failed_to_copy: "Rien n'a été copié. Un autre essai devrait suffire.",
    error_copied_to_clipboard: "Erreur copiée dans le presse-papiers",
    failed_to_update_contact:
      "Vos modifications de contact ne se sont pas enregistrées. Un autre essai devrait suffire. La version précédente est toujours là.",
    failed_to_block_sender:
      "Nous n'avons pas pu bloquer cet expéditeur. Un autre essai devrait suffire.",
    failed_to_rename_folder:
      "Ce dossier n'a pas été renommé. Un autre essai devrait suffire. Le dossier et ses messages sont inchangés.",
    failed_to_change_folder_color:
      "La couleur du dossier ne s'est pas mise à jour. Un autre essai devrait suffire.",
    failed_to_delete_folder:
      "Ce dossier n'a pas été retiré. Un autre essai devrait suffire. Vos messages à l'intérieur sont en sécurité.",
    failed_to_move_folder: "Ce dossier n'a pas été déplacé. Réessayez.",
    failed_to_update_folder_encryption:
      "Le réglage de verrou du dossier n'a pas changé. Un autre essai devrait suffire. Le dossier reste comme il était.",
    failed_to_rename_label:
      "Cette étiquette n'a pas été renommée. Un autre essai devrait suffire.",
    failed_to_change_label_color:
      "La couleur de l'étiquette ne s'est pas mise à jour. Un autre essai devrait suffire.",
    failed_to_change_label_icon:
      "L'icône de l'étiquette ne s'est pas mise à jour. Un autre essai devrait suffire.",
    failed_to_delete_label:
      "Cette étiquette n'a pas été retirée. Un autre essai devrait suffire. Vos messages ne sont pas affectés.",
    failed_to_create_label:
      "Cette étiquette ne s'est pas enregistrée. Un autre essai devrait suffire.",
    failed_to_create_folder_error:
      "Ce dossier ne s'est pas enregistré. Un autre essai devrait suffire.",
    folder_plan_limit_reached:
      "Vous avez atteint la limite de dossiers de votre forfait actuel. Mettez-le à niveau pour en créer davantage.",
    authenticate_to_send: "Authentifiez-vous pour envoyer un e-mail",
    send_authentication_failed:
      "L’authentification ne s’est pas terminée, donc cet e-mail n’a pas été envoyé.",
    failed_to_send_reply:
      "Cette réponse ne s'est pas envoyée. Un autre essai devrait suffire. Votre brouillon est enregistré.",
    failed_to_delete_draft:
      "Ce brouillon n'a pas été retiré. Un autre essai devrait suffire.",
    failed_to_update_rule:
      "Cette règle ne s'est pas enregistrée. Un autre essai devrait suffire. La version précédente est toujours active.",
    failed_to_send_verification:
      "Nous n'avons pas pu envoyer le courriel de vérification. Un autre essai dans un instant suffit en général.",
    failed_to_load_email:
      "Ce message ne s'est pas chargé. Actualiser suffit en général. Le message est en sécurité sur le serveur.",
    failed_to_decrypt_email:
      "Nous n'avons pas pu ouvrir ce message sur cet appareil. Actualiser suffit en général, et se déconnecter puis se reconnecter est la solution de repli si cela continue d'échouer.",
    failed_to_unsubscribe:
      "Le désabonnement ne s'est pas terminé. Le lien dans le message vous emmènera sur le site de l'expéditeur pour le faire vous-même.",
    failed_to_disable_2fa:
      "La double authentification est restée activée. Un autre essai devrait suffire. Votre compte est toujours protégé.",
    failed_to_parse_settings:
      "Ce fichier de paramètres n'a pas pu être lu. Un autre fichier fonctionnera. Vos paramètres actuels sont inchangés.",
    removed_from_contacts: "Retiré des contacts",
    added_to_contacts: "Ajouté aux contacts",
    senders_emails_count: "{{senders}} ({{emails}})",
    no_emails: "Aucun message ici.",
    no_read_emails_to_archive: "Aucun e-mail lu à archiver",
    no_unread_emails: "Aucun e-mail non lu",
    email_copied: "E-mail copié",
    message_id_copied: "ID du message copié",
    draft_deleted: "Brouillon supprimé définitivement",
    no_recipients: "Aucun destinataire",
    sync_complete: "Synchronisation terminée",
    sync_timeout:
      "La synchronisation prend plus de temps que prévu et est peut-être encore en cours.",
    session_expired_login:
      "Votre session s'est terminée. Vous reconnecter vous fera reprendre là où vous étiez. Vos données et brouillons sont enregistrés sur le serveur.",
    session_expired_refresh:
      "Votre session s'est terminée. Actualiser la page vous permettra de vous reconnecter. Vos données sont en sécurité.",
    email_in_locked_folder:
      "Ce message se trouve dans un dossier que vous avez verrouillé. Déverrouiller le dossier l'ouvrira.",
    vault_not_available:
      "Vos clés privées ne sont pas chargées sur cet appareil. Vous reconnecter les déverrouillera. Vos clés sur le serveur sont intactes.",
    no_vault_available:
      "Vos clés privées ne sont pas chargées sur cet appareil. Vous reconnecter les déverrouillera. Vos clés sur le serveur sont intactes.",
    offline_action_queued:
      "Vous êtes hors ligne pour l'instant. Ceci est en file d'attente et se terminera dès que vous serez reconnecté.",
    failed_to_update:
      "Cette modification ne s'est pas enregistrée. Un autre essai devrait suffire.",
    failed_to_load_search_results:
      "Votre recherche ne s'est pas terminée. Un autre essai devrait suffire.",
    failed_to_fetch_tags:
      "Vos étiquettes ne se sont pas chargées. Un autre essai devrait suffire.",
    failed_to_fetch_folders:
      "Vos dossiers ne se sont pas chargés. Un autre essai devrait suffire.",
    failed_to_unlock_folder:
      "Nous n'avons pas pu déverrouiller ce dossier. Vérifier votre mot de passe et réessayer suffit en général. Le contenu du dossier est en sécurité.",
    incorrect_password:
      "Ce mot de passe ne correspondait pas. Un autre essai devrait fonctionner. Votre compte n'est pas verrouillé.",
    folder_no_password_protection:
      "Ce dossier n'a actuellement pas de mot de passe, donc rien à changer.",
    password_already_set:
      "Ce dossier a déjà un mot de passe. Changer de mot de passe est l'option pour le mettre à jour.",
    folder_must_be_unlocked:
      "Déverrouiller le dossier d'abord permettra à ce réglage de changer.",
    cannot_remove_vault_password:
      "Votre dossier Coffre a toujours besoin de son propre mot de passe, et cette protection ne peut pas être retirée.",
    failed_to_load_snoozed_emails:
      "Vos messages en veille ne se sont pas chargés. Un autre essai devrait suffire. Ils sont en sécurité sur le serveur.",
    failed_to_load_subscriptions:
      "Vos abonnements ne se sont pas chargés. Un autre essai devrait suffire.",
    unexpected_error:
      "Quelque chose ne s'est pas passé comme prévu. Un autre essai devrait suffire.",
    failed_to_load_more_subscriptions:
      "Nous n'avons pas pu charger plus d'abonnements. Un autre essai devrait suffire.",
    failed_to_scan_subscriptions:
      "L'analyse des abonnements ne s'est pas terminée. Un autre essai devrait suffire.",
    failed_to_load_drafts:
      "Vos brouillons ne se sont pas chargés. Un autre essai devrait suffire. Vos brouillons enregistrés sont en sécurité.",
    failed_to_load_scheduled_emails:
      "Vos messages programmés ne se sont pas chargés. Un autre essai devrait suffire. Ils sont toujours en bonne voie pour s'envoyer.",
    recently_archived: "Archivé récemment",
    older_items: "Éléments plus anciens",
    long_term_archive: "Archive à long terme",
    failed_to_fetch_archive_stats:
      "Les statistiques d'archive ne se sont pas chargées. Un autre essai devrait suffire.",
    value_too_long:
      "Cette valeur dépasse la limite de longueur. Une version plus courte fonctionnera.",
    please_enter_valid_domain:
      "Ce n'est pas un domaine valide. Quelque chose comme example.com fonctionnera.",
    please_enter_valid_email:
      "Cela ne ressemble pas à un courriel valide. Quelque chose comme nom@example.com fonctionnera.",
    email_local_part_too_long:
      "La partie avant le @ est trop longue. Une version plus courte fonctionnera.",
    forwarding_rule_updated: "Règle de transfert mise à jour",
    forwarding_rule_created: "Règle de transfert créée",
    spam_settings_saved: "Paramètres anti-spam enregistrés",
    email_sent_via_external: "E-mail envoyé via un compte externe.",
    encryption_keys_rotated: "Clés de chiffrement renouvelées avec succès",
    failed_to_retrieve_key:
      "Échec de la récupération de la clé actuelle depuis le serveur",
    failed_to_upload_keys: "Échec du téléversement des clés de chiffrement",
    sending: "Envoi...",
    in_one_minute: "Dans 1 min",
    user_label: "Utilisateur",
    marketing: "Marketing",
    finance_label: "Finances",
    operation: "Opération",
    no_marketing_messages: "Aucun message marketing",
    no_finance_messages: "Aucun message financier",
    no_operation_messages: "Aucun message opérationnel",
    folder_label: "Dossier",
    no_email_id_provided:
      "Nous n'avons pas pu déterminer quel message ouvrir. Revenir en arrière et en choisir un dans votre boîte de réception fonctionnera.",
    please_enter_valid_url:
      "Ce n'est pas une adresse web valide. Un lien complet comme https://example.com fonctionnera.",
    csv_file_empty:
      "Ce CSV ne contient aucune ligne. Un autre fichier devrait fonctionner.",
    no_valid_contacts_csv:
      "Nous n'avons trouvé aucun contact lisible dans ce CSV. Vérifier les en-têtes de colonnes et réessayer suffit en général.",
    label_name_cannot_be_empty:
      "Cette étiquette a besoin d'un nom avant de pouvoir s'enregistrer.",
    folder_name_cannot_be_empty:
      "Ce dossier a besoin d'un nom avant de pouvoir s'enregistrer.",
    please_enter_password: "Votre mot de passe est nécessaire pour continuer.",
    rotation_failed:
      "Le renouvellement des clés ne s'est pas terminé. Vérifier votre mot de passe et réessayer suffit en général. Vos anciennes clés fonctionnent toujours et vos données sont en sécurité.",
    delete_account_error:
      "Nous n'avons pas pu supprimer votre compte tout de suite. Un autre essai dans un instant fonctionne en général, et hello@astermail.org peut aider si cela continue d'échouer.",
    encryption_vault_not_available:
      "Vos clés privées sont verrouillées sur cet appareil. Vous reconnecter les déverrouillera. Vos clés sur le serveur sont inchangées.",
    email_data_missing:
      "Nous n'avons pas pu charger le contenu de ce message. L'ouvrir à nouveau depuis votre boîte de réception devrait le ramener. Votre boîte de réception est inchangée.",
    later: "Plus tard",
    welcome_to_aster: "Bienvenue sur Aster Mail",
    purchase_thank_you:
      "Merci pour votre achat. Votre abonnement est maintenant actif.",
    view_billing_settings: "Voir les paramètres de facturation",
    welcome_description:
      "Cette visite dure environ une minute. Elle couvre quatre choses qui facilitent le premier jour.",
    organize_with_folders: "Organisez avec des dossiers",
    organize_folders_description:
      "Faites glisser un message sur un dossier pour le classer, ou sélectionnez-en plusieurs et déplacez-les ensemble. Pour créer un dossier, cliquez sur le + à côté de Dossiers.",
    customize_settings_description:
      "Les réglages vous permettent d'ajouter un alias, de connecter un domaine personnalisé et d'activer l'authentification à deux facteurs.",
    youre_ready: "Vous êtes prêt",
    youre_ready_description:
      "Vos e-mails sont chiffrés de bout en bout et vous seul détenez les clés. Appuyez sur ? à tout moment pour voir tous les raccourcis clavier.",
    skip_tour: "Passer la visite",
    get_started: "Commencer",
    setup_complete: "Configuration terminée !",
    download_mobile_app: "Télécharger l'application mobile",
    add_recovery_email: "Ajouter un e-mail de récupération",
    import_your_email: "Importer les e-mails depuis Gmail ou Outlook",
    add_email_alias: "Ajouter un alias e-mail",
    hide_permanently: "Masquer cette liste",
    step: "Étape",
    protected_in_transit: "Protégé en transit",
    encryption_available: "Chiffrement disponible",
    encryption_available_desc:
      "Ce destinataire publie une clé de chiffrement utilisable. Cliquez sur le cadenas pour chiffrer ce message de bout en bout.",
    click_to_encrypt: "Cliquez pour chiffrer ce message de bout en bout",
    click_to_disable_encryption:
      "Chiffré - cliquez pour désactiver pour ce message",
    encryption_status_unknown: "Statut de chiffrement indisponible",
    encryption_status_unknown_desc:
      "Nous n'avons pas pu vérifier les clés de ce destinataire. Un nouvel essai vous dira si ce message peut être chiffré de bout en bout.",
    end_to_end_encrypted_label: "Chiffré de bout en bout",
    encrypted_in_transit_stored:
      "Chiffré en transit et stocké de manière chiffrée.",
    only_you_and_sender: "Seuls vous et l'expéditeur pouvez lire ceci.",
    only_you_can_read_contacts:
      "Vous seul pouvez lire vos contacts. Aster ne voit pas ces données.",
    tor_label: "Tor",
    tor_snowflake_label: "Tor (Snowflake)",
    cdn_relay_label: "Relais CDN",
    toggle_selection: "Basculer la sélection",
    failed_to_send_email:
      "Ce message ne s'est pas envoyé. Un autre essai devrait suffire. Votre brouillon est enregistré.",
    failed_to_send_external_email:
      "Ce message ne s'est pas envoyé par votre compte externe lié. Un autre essai devrait suffire. Votre brouillon est enregistré.",
    external_account_token_missing:
      "Votre compte externe lié doit être reconnecté avant l'envoi. Paramètres, Comptes connectés est l'endroit où il se trouve.",
    failed_to_send_via_external:
      "L'envoi par votre compte externe lié n'a pas fonctionné. Un autre essai devrait suffire. Votre brouillon est enregistré.",
    offline_change_failed:
      "Une modification que vous avez faite hors ligne n’a pas pu être enregistrée.",
    offline_send_failed:
      "Un message que vous avez écrit hors ligne n’a pas pu être envoyé.",
    offline_email_queued:
      "Vous êtes hors ligne pour l'instant. Ce message s'enverra dès que vous serez reconnecté.",
    failed_to_queue_offline:
      "Nous n'avons pas pu mettre ce message en file d'attente pour un envoi ultérieur. Un autre essai devrait suffire. Votre brouillon est enregistré.",
    cannot_mix_recipients:
      "Les utilisateurs Aster et les adresses externes ne peuvent pas figurer dans le même message. Les envoyer en deux messages séparés fonctionnera.",
    failed_to_schedule_email:
      "La programmation ne s'est pas enregistrée. Un autre essai devrait suffire. Votre brouillon est enregistré.",
    failed_to_restore_draft:
      "Nous n'avons pas pu ramener ce brouillon. L'ouvrir à nouveau suffit en général. Vos autres brouillons ne sont pas affectés.",
    enter_url: "Saisir l'URL :",
    enter_link_text: "Saisir le texte du lien :",
    conversation_marked_as_spam_toast: "Conversation marquée comme indésirable",
    failed_to_undo_spam:
      "Nous n'avons pas pu annuler cela. Le remettre manuellement est la solution de contournement.",
    conversation_moved_to_trash_toast:
      "Conversation déplacée vers la corbeille",
    failed_to_undo_trash:
      "Nous n'avons pas pu annuler cela. Le remettre manuellement est la solution de contournement.",
    message_archived: "Message archivé",
    message_moved_to_trash: "Message déplacé vers la corbeille",
    message_marked_as_spam: "Message marqué comme indésirable",
    undo_failed:
      "L'annulation n'a pas fonctionné. Un autre essai devrait suffire.",
    expired: "Expiré",
    expires_in: "Expire dans ",
    report_phishing: "Signaler le spam",
    suspicious: "Suspect",
    dangerous: "Dangereux",
    click_to_edit: "Cliquez pour modifier",
    write_your_message: "Rédigez votre message...",
    write_your_reply: "Rédigez votre réponse...",
    switch_to_rich_text: "Passer en texte enrichi",
    switch_to_plain_text: "Passer en texte brut",
    font_size_label: "Taille de la police",
    font_small: "Petit",
    font_normal: "Normal",
    font_large: "Grand",
    font_huge: "Très grand",
    enter_url_display_text: "Saisir une URL et un texte d'affichage optionnel",
    select_table_size: "Sélectionner la taille du tableau",
    emoji: "Émoji",
    recipients: "Destinataires",
    encrypted_attachment: "Pièce jointe chiffrée",
    forward_attachments_locked:
      "La clé de chiffrement de certaines pièces jointes est manquante, elles ne sont donc pas incluses dans ce message.",
    forward_attachments_unavailable:
      "Certaines pièces jointes n'ont pas pu être ajoutées à ce message.",
    image: "Image",
    system: "Système",
    failed_to_permanently_delete:
      "Ces éléments n'ont pas été retirés. Un autre essai devrait suffire.",
    failed_to_delete_emails:
      "Ces messages n'ont pas été retirés. Un autre essai devrait suffire.",
    failed_to_mark_as_read:
      "Ces messages sont toujours marqués comme non lus. Un autre essai devrait suffire.",
    failed_to_mark_as_unread:
      "Ces messages sont toujours marqués comme lus. Un autre essai devrait suffire.",
    n_conversations_archived: "{{ count }} conversations archivées",
    n_conversations_archived_one: "{{count}} conversation archivée",
    n_conversations_archived_other: "{{count}} conversations archivées",
    n_conversations_moved_to_trash:
      "{{ count }} conversations déplacées vers la corbeille",
    n_conversations_moved_to_trash_one:
      "{{count}} conversation déplacée vers la corbeille",
    n_conversations_moved_to_trash_other:
      "{{count}} conversations déplacées vers la corbeille",
    n_conversations_marked_as_spam:
      "{{ count }} conversations marquées comme indésirables",
    internal_only: "Interne uniquement",
    external_only: "Externe uniquement",
    all_accounts: "Tous les comptes",
    all_external_accounts: "Tous les comptes externes",
    failed_to_rotate_keys:
      "Le renouvellement des clés ne s'est pas terminé. Un autre essai devrait suffire. Vos anciennes clés fonctionnent toujours et vos données sont en sécurité.",
    read: "Lu",
    or_conjunction: "ou",
    press_label: "Appuyez sur",
    anywhere_to_open_shortcuts: "n'importe où pour ouvrir cette fenêtre",
    showing_shortcuts_for: "Affichage des raccourcis pour",
    emoji_smileys: "Émoticônes",
    emoji_gestures: "Gestes",
    emoji_hearts: "Cœurs",
    emoji_celebration: "Célébration",
    emoji_symbols: "Symboles",
    emoji_animals: "Animaux",
    emoji_food: "Nourriture",
    emoji_travel: "Voyage",
    emoji_objects: "Objets",
    emoji_activities: "Activités",
    emoji_flags: "Drapeaux",
    no_emojis_found: "Aucun émoji trouvé",
    item_copied: "{{ label }} copié",
    copied_item: "{{ label }} copié",
    blocked_email: "{{ email }} bloqué",
    unblocked_email: "{{ email }} débloqué",
    removed_from_allowlist: "{{ email }} retiré de la liste autorisée",
    added_to_allowlist: "{{ email }} ajouté à la liste autorisée",
    no_content: "Aucun contenu",
    unblocked_count_senders: "{{ count }} expéditeurs débloqués",
    removed_count_from_allowlist: "{{ count }} retirés de la liste autorisée",
    failed_to_add_label:
      "Cette étiquette n'a pas été ajoutée. Un autre essai devrait suffire.",
    failed_to_remove_label:
      "Cette étiquette n'a pas été retirée. Un autre essai devrait suffire.",
    failed_to_move_email:
      "Ce message ne s'est pas déplacé. Un autre essai devrait suffire. Le message est en sécurité là où il était.",
    failed_to_add_labels:
      "Ces étiquettes n'ont pas été ajoutées. Un autre essai devrait suffire.",
    failed_to_remove_labels:
      "Ces étiquettes n'ont pas été retirées. Un autre essai devrait suffire.",
    failed_to_copy_to_clipboard:
      "Rien n'a été copié dans votre presse-papiers. Un autre essai devrait suffire.",
    add_note_placeholder: "Ajouter une note...",
    add_private_note_placeholder: "Ajouter une note privée...",
    search_anything: "Rechercher n'importe quoi...",
    add_recipient: "Ajouter un destinataire",
    enter_folder_name: "Saisir le nom du dossier",
    search_labels: "Rechercher des libellés",
    enter_label_name: "Saisir le nom du libellé",
    leaving_aster_mail: "Quitter Aster Mail",
    unlock_aster_mail: "Déverrouiller Aster Mail",
    aster_mail_locked: "Aster Mail est verrouillé",
    share_aster_mail: "Partager Aster Mail",
    share_aster_description:
      "Partagez Aster Mail avec vos amis et votre famille",
    merge_contacts: "Fusionner les contacts",
    merged_result_preview: "Aperçu du résultat fusionné",
    merge_all: "Tout fusionner",
    duplicate_contacts: "Contacts en double",
    contact_sync: "Synchronisation des contacts",
    sync_confirm_title: "Synchroniser les contacts",
    sync_confirm_message:
      "Voulez-vous vraiment synchroniser vos contacts mobiles avec Aster ? Les nouveaux contacts de votre appareil seront importés.",
    sync_button: "Synchroniser",
    server_url: "URL du serveur",
    from_label: "De :",
    to_label: "À :",
    cc_label: "Cc :",
    bcc_label: "Cci :",
    received_on_label: "Reçu sur :",
    date_label: "Date :",
    subject_label: "Objet :",
    send_at_label: "Envoyer à :",
    received: "Reçu",
    select_email_to_read: "Sélectionnez un e-mail à lire",
    remove_from_contacts: "Retirer des contacts",
    messages_from_sender: "Messages de cet expéditeur",
    powered_by: "Propulsé par",
    mobile_settings: "Paramètres mobiles",
    app_lock: "Verrouillage de l'application",
    app_locked: "Aster Mail est verrouillé",
    enter_pin_to_unlock: "Entrez votre PIN pour déverrouiller",
    wrong_pin: "Code PIN incorrect",
    app_lock_locked_out: "Trop de tentatives incorrectes",
    app_lock_attempts_remaining: "{{count}} tentatives restantes",
    app_lock_try_again_in: "Réessayez dans {{s}}s",
    duress_confirm_title: "Voulez-vous vraiment continuer ?",
    duress_confirm_subtitle: "Effacer les données locales",
    duress_confirm_desc:
      "Tous les e-mails, clés et données de session stockés localement seront effacés de cet appareil, et vous serez déconnecté.",
    duress_confirm_detail:
      "Votre compte et vos données chiffrées restent en sécurité sur les serveurs d’Aster. Vous pouvez vous reconnecter à tout moment.",
    duress_confirm_proceed: "Effacer les données locales",
    secure_send: "Envoi sécurisé",
    push_notifications: "Notifications push",
    enabled: "Activé",
    haptic_feedback: "Retour haptique",
    offline_queue: "File d'attente hors ligne",
    pending_actions: "Actions en attente",
    create_new_label: "Créer un nouveau libellé",
    subtotal: "Sous-total",
    shipping: "Livraison",
    tax: "Taxe",
    discount: "Remise",
    copy_source: "Copier la source",
    forwarded_message: "Message transféré",
    forwarded_message_header: "---------- Message transféré ---------",
    display_name_example: "Jean Dupont",
    blocked_content_count: "Contenu bloqué ({{count}})",
    pick_snooze_time: "Choisir l'heure de mise en veille",
    time_label: "Heure :",
    select_date: "Sélectionner la date",
    choose_specific_expiration: "Choisir une expiration spécifique",
    choose_specific_time: "Choisir une heure spécifique",
    to_me: "à moi",
    decrypting: "Déchiffrement...",
    tracking_pixels: "pixels de suivi",
    fonts: "polices",
    stylesheets: "feuilles de style",
    font: "Police",
    stylesheet: "Feuille de style",
    tracking_pixel: "Pixel de suivi",
    me: "moi",
    snoozed_until_label: "En veille jusqu'à {{time}}",
    notification_banner_message:
      "Activez les notifications sur ordinateur pour rester informé des nouveaux e-mails",
    notification_banner_allow: "Autoriser",
    subscriptions: "Abonnements",
    unsubscribed_count: "Désabonnés ({{count}})",
    one_click_unsubscribe: "Désabonnement en un clic pris en charge",
    no_unsubscribed_senders: "Aucun expéditeur désabonné",
    total: "Total",
    learn_more: "En savoir plus",
    buy_more_storage: "Acheter plus de stockage",
    save_failed:
      "Vos modifications ne se sont pas enregistrées. Vérifier votre connexion et réessayer suffit en général. La version précédente est toujours là.",
    block: "Bloquer",
    state_province: "État / Province",
    files_end_to_end_encrypted: "Ces fichiers sont chiffrés de bout en bout.",
    duplicate_send_blocked:
      "Ce message vient de partir. Vérifiez votre dossier Envoyés avant de le renvoyer.",
    empty_body_error:
      "Un objet ou un peu de texte est nécessaire avant l'envoi.",
    subject_too_long:
      "Votre objet dépasse la limite de 998 caractères. Une version plus courte s'enverra.",
    notification_banner_no_thanks: "Non merci",
    payment_past_due_message:
      "Votre dernier paiement n'a pas abouti. Mettez à jour votre moyen de paiement pour conserver votre offre.",
    payment_past_due_message_days:
      "Votre dernier paiement n'a pas abouti. Mettez à jour votre moyen de paiement sous {{days}} jours pour conserver votre offre.",
    payment_past_due_action: "Mettre à jour le paiement",
    ghost_label: "Fantôme",
    ghost_mode_tooltip:
      "Envoyé via le mode Fantôme. Votre adresse réelle a été masquée.",
    bounced_label: "Rejeté",
    failed_label: "Échec",
    scheduled_label: "Programmé",
    error_label: "Erreur",
    message_source: "Source du message",
    message_not_found: "Message introuvable",
    reply_label: "Répondre",
    forward_label: "Transférer",
    carbon_copy: "Copie carbone",
    blind_carbon_copy: "Copie carbone invisible",
    end_to_end_encrypted_email: "E-mail chiffré de bout en bout",
    terms_of_service: "Conditions d'utilisation",
    privacy_policy: "Politique de confidentialité",
    invite_encrypted_email: "Invitez vos amis à découvrir l'e-mail chiffré",
    password_set: "Mot de passe défini",
    sending_as: "Envoi en tant que",
    auto_expire_after: "Expiration automatique après",
    n_days: "{{count}} jours",
    change_password_label: "Changer le mot de passe",
    set_password_label: "Définir un mot de passe",
    require_password_expiry:
      "Exiger un mot de passe pour voir cet e-mail après son expiration.",
    enter_password_optional: "Saisir un mot de passe (optionnel)",
    developer_label: "Développeur",
    developer_mode_enabled: "Mode développeur activé",
    developer_mode_disabled: "Mode développeur désactivé",
    taps_to_developer_mode: "{{count}} appui(s) avant le mode développeur",
    service_workers_unregistered: "Service workers désenregistrés",
    disable_developer_mode: "Désactiver le mode développeur",
    storage_keys: "Clés de stockage",
    no_contacts_found_device: "Aucun contact trouvé sur l'appareil",
    no_new_contacts_imported: "Aucun nouveau contact importé",
    contacts_imported_count: "{{count}} contacts importés",
    sender_blocked: "Expéditeur bloqué",
    snooze_label: "Mettre en veille",
    linkedin: "LinkedIn",
    twitter_x: "Twitter / X",
    github: "GitHub",
    social_links: "Liens sociaux",
    profile_photo_label: "Photo de profil",
    attachments_label: "Pièces jointes",
    custom_fields_label: "Champs personnalisés",
    none_label: "Aucun",
    contact_1: "Contact 1",
    contact_2: "Contact 2",
    name_colon: "Nom :",
    emails_colon: "E-mails :",
    phone_colon: "Téléphone :",
    company_colon: "Entreprise :",
    address_colon: "Adresse :",
    icon_label: "Icône",
    color_label: "Couleur",
    icon_optional: "Icône (optionnel)",
    label_preview: "Aperçu du libellé",
    verify_setup: "Vérifier la configuration",
    share_aster_mail_label: "Partager Aster Mail",
    more_actions: "Plus d'actions",
    compose_email_label: "Rédiger un e-mail",
    open_menu_label: "Ouvrir le menu",
    edit_contact: "Modifier le contact",
    new_contact: "Nouveau contact",
    at_least_one_name_required: "Au moins un nom est requis",
    at_least_one_email_required: "Au moins un e-mail est requis",
    choose_values_to_keep: "Choisissez les valeurs à conserver",
    empty: "Vide",
    merging: "Fusion en cours...",
    send_email: "Envoyer un e-mail",
    folder_preview: "Aperçu du dossier",
    rename_label: "Renommer le libellé",
    rename_label_description: "Saisir un nouveau nom pour ce libellé",
    change_label_color: "Modifier la couleur du libellé",
    change_label_icon: "Modifier l'icône du libellé",
    select_an_icon: "Sélectionner une icône",
    delete_label: "Supprimer le libellé",
    label_permanently_deleted_warning:
      "Cette étiquette sera retirée de tous les messages qui la portent, et vous ne pouvez pas annuler cette action. Les messages eux-mêmes restent dans votre compte.",
    confirm_delete_label: "Voulez-vous vraiment supprimer le libellé",
    add_another_email_count: "Ajouter un autre e-mail ({{current}}/{{max}})",
    drop_files_or_click: "Déposer les fichiers ici ou cliquer pour téléverser",
    max_size_per_file: "Max {{size}} par fichier",
    uploading_progress: "Téléversement...",
    n_messages_count: "{{count}} messages",
    view_all_messages: "Voir tous les messages",
    unable_to_decrypt: "Nous n'avons pas pu ouvrir ce message",
    decrypt_session_expired_message:
      "Nous n'avons pas pu ouvrir ce message sur cet appareil, souvent parce que la session s'est terminée. Votre message et vos clés sur le serveur sont inchangés.",
    decrypt_try_sign_out:
      "Se déconnecter puis se reconnecter rechargera vos clés. Si le message ne s'ouvre toujours pas, hello@astermail.org peut vous aider.",
    n_files: "{{count}} fichier",
    n_files_plural: "{{count}} fichiers",
    n_of_n_contacts: "{{ filtered }} sur {{ total }}",
    contact_count_other: "{{count}} contacts",
    contact_count_one: "{{count}} contact",
    no_contacts_match: 'Aucun contact ne correspond à "{{ query }}"',
    add_contacts_quick_email_hint:
      "Ajoutez des contacts pour écrire rapidement aux personnes que vous contactez souvent",
    no_contacts_yet: "Pas encore de contacts",
    export_filtered_count: "Exporter la sélection ({{ count }})",
    export_all_contacts: "Exporter tous les contacts",
    job_title_at_company: "{{ job_title }} chez {{ company }}",
    check_spam_folder_note:
      "Vous n’avez pas reçu l’e-mail ? Vérifiez votre dossier indésirables. Le lien expire dans 24 heures.",
    verification_link_sent_to:
      "Nous avons envoyé un lien de vérification à {{email}}. Cliquez sur le lien dans l’e-mail pour vérifier votre identité.",
    recovery_email_verified_redirect:
      "Votre e-mail de récupération est vérifié. Redirection en cours...",
    recovery_email_encrypted_note:
      "Cet e-mail servira uniquement à récupérer le compte et à vérifier votre identité. Il est chiffré et Aster ne peut pas le lire.",
    add_recovery_email_gate_desc:
      "Un courriel de récupération vérifié est nécessaire pour continuer à utiliser Aster Mail. C'est ainsi que vous récupérez l'accès si vous oubliez votre mot de passe, donc une adresse que vous pouvez toujours atteindre reste le choix le plus sûr.",
    recovery_email_already_used:
      "Ce courriel est déjà une adresse de récupération sur un autre compte. Un autre devrait fonctionner.",
    vault_access_error:
      "Nous n'avons pas pu ouvrir vos clés privées sur cet appareil. Se déconnecter puis se reconnecter les rechargera. Vos clés et données sur le serveur sont inchangées.",
    recovery_email_label: "E-mail de récupération",
    sender_type_ghost: "Fantôme",
    sender_type_external: "Externe",
    sender_type_domain: "Domaine",
    sender_type_alias: "Alias",
    sender_group_ghost: "Fantôme",
    sender_group_external: "Comptes externes",
    sender_group_custom_domains: "Domaines personnalisés",
    sender_group_aliases: "Alias",
    sender_group_primary: "Principal",
    hide_real_address_expiry:
      "Masquer votre adresse réelle (expire dans {{days}} j)",
    create_ghost_alias: "Créer un alias fantôme",
    new_email_body: "Vous avez un nouvel e-mail",
    settings_disabled_suspended:
      "Les paramètres sont désactivés pendant que votre compte est suspendu. hello@astermail.org peut aider pour un appel ou plus de détails.",
    submit_an_appeal: "Soumettre un recours",
    account_suspended_default_reason:
      "Votre compte est suspendu pour une violation des conditions d'utilisation. hello@astermail.org peut aider pour un appel ou plus de détails.",
    account_suspended_label: "Votre compte est suspendu.",
    submitting: "Envoi en cours...",
    no_folders_available: "Aucun dossier disponible",
    select_destination_folder: "Sélectionner le dossier de destination",
    snooze_until: "Reporter jusqu'à",
    count_emails: "{{count}} e-mails",
    no_senders_with_multiple_emails: "Aucun expéditeur avec plusieurs e-mails",
    snoozing_emails: "Report en cours...",
    emails_will_reappear: "{{count}} e-mail(s) réapparaîtront {{time}}",
    emails_snoozed: "E-mails reportés",
    signed_out_inactivity:
      "Nous vous avons déconnecté après une période d'inactivité pour protéger votre compte. Vous reconnecter vous fera reprendre là où vous étiez.",
    session_expired_sign_in:
      "Votre session s'est terminée. Vous reconnecter vous fera reprendre là où vous étiez. Vos données et brouillons sont enregistrés sur le serveur.",
    press_shortcut_to_send: "Appuyer sur ⌘+Entrée pour envoyer",
    secured_by_aster_mail: "Sécurisé par",
    cc_bcc_label: "CC/CCI",
    user_agent_label: "Agent utilisateur",
    screen_label: "Écran",
    viewport_label: "Fenêtre",
    platform_label: "Plateforme",
    user_id_label: "ID utilisateur",
    ctrl_click_to_open: "Ctrl+Clic pour ouvrir",
    n_items: "{{ count }} éléments",
    n_images: "{{ count }} images",
    view_blocked_content_details: "Voir les détails du contenu bloqué",
    extracted_locally_message:
      "Extrait localement depuis votre e-mail, et rien n'est envoyé à nos serveurs.",
    delivery_address: "Adresse de livraison",
    estimated_delivery: "Livraison estimée",
    tracking_number: "Numéro de suivi",
    track_package: "Suivre le colis",
    estimated_short: "Prév. {{ date }}",
    shipment_update: "Mise à jour d'expédition",
    signal_urgency_language:
      "Ce message utilise un langage urgent ou menaçant souvent vu dans les arnaques. Ralentir avant d'agir reste le geste le plus sûr.",
    signal_display_name_email_mismatch:
      "Le nom et l'adresse réelle de l'expéditeur ne correspondent pas, ce qui est un schéma courant d'hameçonnage.",
    signal_display_name_brand_spoof_client:
      "Le nom de l'expéditeur reprend celui d'une marque connue, ce qui est une astuce courante d'hameçonnage.",
    signal_homoglyph_domain:
      "Ce message contient des liens vers des domaines sosies conçus pour imiter des sites légitimes. Évitez d'y cliquer.",
    signal_url_on_blocklist:
      "Ce message contient des liens vers des sites connus pour l'hameçonnage. N'y cliquez pas.",
    signal_safe_browsing_match:
      "Le domaine de cet expéditeur a été signalé pour héberger du contenu non sécurisé.",
    signal_domain_blocklist:
      "Le domaine de cet expéditeur figure sur une liste de blocage d'hameçonnage connue. À traiter comme hostile.",
    signal_display_name_email_spoof:
      "Le nom affiché de l'expéditeur montre une adresse mais le message vient en réalité d'une autre, ce qui est un schéma courant d'hameçonnage.",
    signal_display_name_brand_spoof:
      "Le nom de l'expéditeur reprend celui d'une marque connue, ce qui est une astuce courante d'hameçonnage.",
    signal_rbl_other:
      "Le serveur qui a envoyé ce message figure sur une liste de blocage de spam en temps réel.",
    signal_rbl_barracuda:
      "Le serveur qui a envoyé ce message figure sur une liste de blocage de spam bien connue.",
    signal_rbl_spamhaus:
      "Le serveur qui a envoyé ce message figure sur une liste de blocage de spam bien connue.",
    signal_user_reputation_high:
      "Vous avez déjà signalé cet expéditeur, donc nous mettons ce message en évidence pour vous.",
    signal_domain_new:
      "Le domaine de cet expéditeur n'a été enregistré que récemment, ce qui est courant pour les campagnes d'arnaque.",
    signal_domain_reputation_medium:
      "Le domaine de cet expéditeur a une réputation mitigée. Un regard attentif avant d'agir sur quoi que ce soit à l'intérieur en vaut la peine.",
    signal_domain_reputation_high:
      "Le domaine de cet expéditeur a une mauvaise réputation auprès de la communauté du courrier.",
    signal_future_dated:
      "L'horloge de l'expéditeur indique que ce message a été écrit dans le futur, ce qui peut indiquer une falsification ou un expéditeur mal configuré.",
    signal_multiple_from:
      "Ce message revendique plusieurs expéditeurs à la fois, ce qui est un signe courant de falsification.",
    signal_missing_message_id:
      "Ce message n'a pas l'identifiant unique que le courrier légitime porte normalement.",
    signal_missing_from:
      "Ce message n'a pas de ligne De, ce qui est inhabituel et mérite d'être traité avec prudence.",
    signal_reply_to_mismatch:
      "Les réponses à ce message iraient vers un domaine différent de celui affiché comme expéditeur, ce qui est un schéma courant d'hameçonnage.",
    signal_all_auth_pass:
      "Toutes les vérifications d'authentification e-mail ont réussi",
    signal_all_auth_fail:
      "Toutes les vérifications d'expéditeur sur ce message ont échoué, donc il est peut-être falsifié. Ne faites pas confiance à ses liens ou pièces jointes sans confirmer l'expéditeur d'une autre façon.",
    auth_fail_banner_title: "Nous n'avons pas pu confirmer l'expéditeur.",
    auth_fail_banner_body:
      "Nous n'avons pas pu confirmer que ce message provient vraiment de l'adresse affichée, et il est peut-être usurpé. Vérifier l'expéditeur par un autre canal avant d'ouvrir les liens ou pièces jointes reste la voie la plus sûre. Votre compte n'est pas affecté.",
    signal_dmarc_fail:
      "Le domaine de cet expéditeur rejette les messages qui échouent à ses règles anti-usurpation, et celui-ci a échoué. À traiter avec prudence.",
    signal_spf_fail:
      "Le serveur qui a envoyé ce message n'est pas un serveur habituel de ce domaine. L'expéditeur est peut-être usurpé.",
    signal_dkim_fail:
      "Nous n'avons pas pu vérifier la signature de l'expéditeur. Ce message a peut-être été modifié en transit ou falsifié.",
    i_understand_the_risks: "je comprends les risques",
    links_re_enabled: "Les liens ont été réactivés.",
    enable_links: "Activer les liens",
    view_links_anyway: "Voir les liens quand même",
    show_reasons: "Afficher les motifs",
    hide_reasons: "Masquer les motifs",
    phishing_danger_message:
      "Ce message ressemble à une tentative d'hameçonnage, et ses liens ont été désactivés pour votre sécurité. Si vous faites confiance à l'expéditeur, la bannière propose une option pour les réactiver. Votre compte reste par ailleurs intact.",
    dangerous_email_links_disabled: "Message dangereux, liens désactivés.",
    i_understand: "Je comprends",
    not_phishing: "Pas du hameçonnage",
    show_details: "Afficher les détails",
    hide_details: "Masquer les détails",
    phishing_warning_message:
      "Nous avons signalé ce message comme suspect. Tout son contenu mérite d'être traité avec prudence, et confirmer l'expéditeur par un autre canal avant de cliquer sur les liens ou de partager des informations personnelles vous garde plus en sécurité. Votre boîte de réception et votre compte ne sont pas affectés.",
    suspicious_email_detected: "Ce message semble suspect.",
    n_lines: "{{ count }} lignes",
    check_out_aster_mail:
      "Découvrez Aster Mail, une meilleure façon de gérer vos e-mails",
    share_on_social: "Partager sur les réseaux sociaux",
    copy_invite_link: "Copier le lien d'invitation",
    send_invite_via_email: "Envoyer l'invitation par e-mail",
    continue_label: "Continuer",
    all_done: "Terminé",
    this_contact: "ce contact",
    delete_contacts_confirm:
      "Supprimer ce contact définitivement. Cette action ne peut pas être annulée.",
    delete_contact_confirm:
      "Supprimer ce contact définitivement. Cette action ne peut pas être annulée.",
    unlock_vault_to_view: "Déverrouiller votre coffre pour voir les contacts",
    vault_locked: "Coffre verrouillé",
    one_day: "1 jour",
    n_hours: "{{ count }} heures",
    unknown_label: "Inconnu",
    dont_show_warning_again: "Ne plus afficher cet avertissement",
    external_link_warning:
      "Vous êtes sur le point de quitter Aster pour un site externe. Ouvrir ce lien convient si vous faites confiance à la destination.",
    and_word: "et",
    legal_agree_prefix: "En créant un compte, vous acceptez nos",
    delete_confirm_phrase: "supprimer mon compte",
    name_section: "Nom",
    notes_section: "Notes",
    social_section: "Réseaux sociaux",
    address_section: "Adresse",
    birthday_section: "Anniversaire",
    work_section: "Travail",
    phone_section: "Téléphone",
    email_section: "E-mail",
    call: "Appeler",
    selected_count: "{{ count }} sélectionné(s)",
    load_more: "Charger plus",
    no_email_history: "Pas encore d'historique d'e-mails avec ce contact",
    first_contact_colon: "Premier contact :",
    last_colon: "Dernier :",
    show_stats: "Afficher les statistiques",
    hide_stats: "Masquer les statistiques",
    communication_history: "Historique des communications",
    edit_label: "Modifier le libellé",
    edit_folder: "Modifier le dossier",
    ghost_mode_description:
      "Répondez depuis un alias jetable. Votre adresse réelle reste masquée.",
    ghost_mode_title: "Mode fantôme",
    disabled: "Désactivé",
    files_protected_in_transit:
      "Ces fichiers ont été protégés et chiffrés en transit.",
    aster_user: "Utilisateur Aster",
    allow_sender: "Ajouter à la liste autorisée",
    remove_from_allowlist_action: "Retirer de la liste autorisée",
    failed_to_allow_sender:
      "Cet expéditeur n'a pas été ajouté à votre liste d'autorisation. Un autre essai devrait suffire.",
    account_limit_reached: "Limite de comptes atteinte",
    account_suspended: "Compte suspendu",
    action_undone: "Action annulée",
    add_display_name_placeholder: "Ajouter un nom d'affichage",
    adding_file_would_exceed_limit:
      "L'ajout de « {{name}} » dépasserait la limite de {{size}} pour les pièces jointes. Retirez d'abord un fichier, ou envoyez-le dans un e-mail séparé.",
    advanced_toolbar: "Barre d'outils avancée",
    alias_avatar_removed: "Avatar de l'alias supprimé",
    alias_avatar_updated: "Avatar de l'alias mis à jour",
    alias_avatars_feature: "Avatars d'alias",
    alias_avatars_locked: "Avatars d'alias verrouillés",
    alias_display_name_updated: "Nom d'affichage de l'alias mis à jour",
    all_short: "Tout",
    and_n_more: "Et {{count}} de plus...",
    auth_fail_tooltip_dkim: "La signature DKIM est invalide ou absente.",
    auth_fail_tooltip_dmarc: "Le message a échoué à la vérification DMARC.",
    auth_fail_tooltip_intro:
      "Ce message a échoué à certaines vérifications d'authentification :",
    auth_fail_tooltip_spf: "Le serveur d'envoi n'est pas autorisé par SPF.",
    back_to_inbox: "Retour à la boîte de réception",
    blocked_items_count: "{{count}} élément(s) bloqué(s)",
    change_alias_avatar: "Modifier l'avatar de l'alias",
    click_to_add_value: "Cliquer pour ajouter une valeur",
    contacts_deleted: "{{ count }} contact(s) supprimé(s)",
    contacts_starred: "{{ count }} contact(s) marqué(s) d'une étoile",
    contacts_unstarred: "Étoile retirée de {{ count }} contact(s)",
    conversations_starred_bulk:
      "{{count}} conversation(s) marquée(s) d'une étoile",
    conversations_unstarred_bulk: "Étoile retirée de {{count}} conversation(s)",
    conversations_moved_to_inbox_bulk:
      "{{count}} conversation(s) déplacée(s) vers la boîte de réception",
    conversations_marked_as_not_spam_bulk:
      "{{count}} conversation(s) marquée(s) comme non indésirable(s)",
    bulk_action_partially_applied:
      "{{count}} conversation(s) sur {{total}} mises à jour. Le reste n'a pas changé.",
    bulk_action_truncated:
      "Cette exécution a traité les {{count}} premiers messages. Relancez l'action pour traiter le reste.",
    bulk_action_continues_in_background:
      "Les messages restants sont encore en cours de mise à jour en arrière-plan.",
    custom_fields: "Champs personnalisés",
    device_revoked: "Appareil révoqué",
    display_name_too_long: "Le nom d'affichage est trop long",
    draft_category: "Brouillons",
    drop_image_or_click: "Déposez une image ou cliquez pour sélectionner",
    edit_display_name: "Modifier le nom d'affichage",
    alias_note_updated: "Note mise à jour",
    alias_websites_updated: "Sites web mis à jour",
    failed_update_alias_websites:
      "Impossible d'enregistrer les sites web. Veuillez réessayer.",
    alias_website_invalid:
      "Cela ne ressemble pas à une adresse de site valide. Essayez par exemple example.com.",
    alias_websites_limit_reached:
      "Vous pouvez enregistrer jusqu'à 10 sites web par alias.",
    add_alias_website: "Ajouter un site web",
    add_alias_website_placeholder: "Ajouter un site où vous vous êtes inscrit",
    alias_add_details: "Ajouter des détails",
    alias_websites_count: "{{count}} sites web",
    remove_alias_website: "Supprimer le site web",
    failed_update_alias_note: "Votre note n'a pas été enregistrée. Réessayez.",
    alias_note_too_long:
      "Cette note dépasse la limite de longueur. Une plus courte fonctionnera.",
    add_alias_note_placeholder: "Ajouter une note",
    edit_alias_note: "Modifier la note",
    failed_remove_recovery_email:
      "Échec de la suppression de l'e-mail de récupération",
    failed_save_profile_color:
      "Échec de l'enregistrement de la couleur du profil",
    failed_to_change_folder_password:
      "Échec de la modification du mot de passe du dossier",
    failed_to_get_key_status: "Échec de la récupération du statut de la clé",
    failed_to_read_named_file: "Échec de la lecture du fichier {{name}}",
    failed_to_remove_folder_password:
      "Échec de la suppression du mot de passe du dossier",
    failed_to_set_folder_password:
      "Échec de la définition du mot de passe du dossier",
    failed_update_alias_avatar:
      "Échec de la mise à jour de l'avatar de l'alias",
    failed_update_alias_display_name:
      "Échec de la mise à jour du nom d'affichage de l'alias",
    file_already_attached: "{{name}} est déjà joint à cet e-mail.",
    metadata_not_removed:
      "Impossible de supprimer les métadonnées masquées de {{names}}. Le fichier a été joint tel quel.",
    file_exceeds_max_size:
      '"{{name}}" dépasse la limite de {{size}} par fichier. Une version plus petite, ou un lien partagé, passera.',
    file_exceeds_max_size_upgradable:
      '"{{name}}" dépasse la limite de {{size}} par fichier de votre offre. Une offre supérieure la porte à {{max_size}}.',
    folder_fallback: "Dossier",
    found_n_contacts: "{{count}} contacts trouvés",
    found_one_contact: "1 contact trouvé",
    health_check_failed: "La vérification d'état a échoué",
    image_load_failed: "Échec du chargement de l'image",
    image_processing_failed: "Échec du traitement de l'image",
    images_count: "{{count}} images",
    images_count_plural: "{{count}} images",
    import_n_contacts: "Importer {{count}} contacts",
    import_one_contact: "Importer 1 contact",
    label_fallback: "Étiquette",
    label_system_archive: "Archives",
    label_system_drafts: "Brouillons",
    label_system_inbox: "Boîte de réception",
    label_system_sent: "Envoyés",
    label_system_spam: "Indésirables",
    label_system_trash: "Corbeille",
    marking_as_read_count:
      "Marquage de {{completed}} sur {{total}} comme lu...",
    mention_notification: "{{ sender }} vous a mentionné",
    message_will_be_sent_shortly: "Le message sera envoyé dans un instant",
    more_aliases: "{{count}} alias supplémentaires",
    n_contacts_imported: "{{count}} contacts importés",
    n_emails: "{{count}} e-mails",
    n_more: "+{{count}} de plus",
    n_more_recipients: "+{{count}} de plus",
    new_email_notification: "Nouvel e-mail de {{ sender }}",
    no_custom_fields_yet: "Aucun champ personnalisé pour l'instant",
    no_matching_labels: "Aucune étiquette correspondante",
    not_now: "Pas maintenant",
    on_separator: "le",
    onboarding_checklist_dismiss: "Ignorer",
    onboarding_checklist_first_email: "Envoyer votre premier e-mail",
    first_run_title: "Votre boîte de réception est prête",
    first_run_subtitle:
      "Importez votre courrier actuel maintenant ou plus tard dans les Réglages.",
    first_run_import: "Importer mon courrier",
    first_run_skip: "Commencer avec une boîte vide",
    first_run_privacy_note:
      "Votre courrier est chiffré sur votre appareil. Aster ne peut pas le lire.",
    recovery_reminder_title: "Ajoutez un moyen de récupérer votre compte",
    recovery_reminder_body:
      "Aster chiffre votre courrier avec votre mot de passe, donc personne ne peut le réinitialiser à votre place. Ajoutez une adresse de récupération pour garder un accès.",
    recovery_reminder_action: "Ajouter une adresse de récupération",
    recovery_reminder_later: "Plus tard",
    plan_prompt_title: "Vous êtes sur le forfait gratuit",
    plan_prompt_body:
      "Les forfaits payants ajoutent plus de stockage, des domaines personnalisés et des alias illimités.",
    plan_prompt_action: "Voir les forfaits",
    plan_prompt_dismiss: "Ignorer",
    onboarding_checklist_import_mail: "Importer votre courrier existant",
    onboarding_checklist_install_app: "Installer l'application",
    onboarding_checklist_recovery_method:
      "Configurer une méthode de récupération",
    onboarding_checklist_title: "Premiers pas",
    one_email: "1 e-mail",
    pending_deletion_cancel_prompt: "Annuler la suppression",
    pending_deletion_cancelling: "Annulation en cours...",
    family_2fa_title: "Authentification à deux facteurs requise",
    family_2fa_body:
      "Votre forfait famille exige l'authentification à deux facteurs. Activez-la pour continuer à utiliser ce compte.",
    family_2fa_action: "Activer l'authentification à deux facteurs",
    family_2fa_sign_out: "Se déconnecter",
    pending_deletion_days: "Suppression dans {{days}} jour(s)",
    pending_deletion_dismiss: "Ignorer",
    pending_deletion_body:
      "Votre compte est programmé pour la suppression. Annulez la suppression pour conserver votre compte et retrouver l'accès à votre courrier.",
    pending_deletion_sign_out: "Se déconnecter",
    pending_deletion_error: "Impossible de restaurer votre compte. Réessayez.",
    pending_deletion_keep: "Conserver le compte",
    pending_deletion_title: "Suppression du compte en attente",
    permission_denied: "Permission refusée",
    photo_format_hint: "JPG ou PNG, max 5 Mo",
    pin_preferred_sender: "Épingler l'expéditeur préféré",
    press_enter: "Appuyez sur Entrée",
    press_enter_to_view_all: "Appuyez sur Entrée pour tout afficher",
    print_bcc: "Cci :",
    print_cc: "Cc :",
    print_date: "Date :",
    print_email_title: "Impression de l'e-mail",
    print_from: "De :",
    print_no_subject: "(Sans objet)",
    print_to: "À :",
    probation_message: "Votre compte est en période d'essai.",
    profile: "Profil",
    profile_photo: "Photo de profil",
    recovery_email_removed: "E-mail de récupération supprimé",
    recovery_email_hidden: "Enregistré sur ce compte",
    recovery_pdf_account: "Compte",
    recovery_pdf_code_used_once:
      "Chaque code ne peut être utilisé qu'une seule fois.",
    recovery_pdf_footer: "Aster Mail - Codes de récupération",
    recovery_pdf_generated: "Généré le",
    recovery_pdf_important_warning: "Avertissement important",
    recovery_pdf_keep_safe: "Conservez ce document en lieu sûr.",
    recovery_pdf_no_digital: "Ne stockez pas ce document numériquement.",
    recovery_pdf_store_secure: "Rangez ce document dans un endroit sécurisé.",
    recovery_pdf_title: "Codes de récupération",
    recovery_pdf_unrecoverable:
      "Si vous perdez ces codes et votre mot de passe, votre compte ne pourra pas être récupéré.",
    recovery_pdf_used: "Utilisé",
    recovery_pdf_your_codes: "Vos codes de récupération",
    recovery_text_code_used_on: "Code {{ number }} utilisé le : ____________",
    recovery_text_if_forgot:
      "Si vous oubliez votre mot de passe, utilisez ces codes pour récupérer l'accès.",
    recovery_text_keep_safe: "Conservez ces codes en lieu sûr.",
    recovery_text_mark_used: "Barrez chaque code après utilisation.",
    recovery_text_no_share: "Ne partagez jamais ces codes.",
    recovery_text_store_secure: "Rangez ces codes dans un endroit sécurisé.",
    recovery_text_title: "Codes de récupération",
    recovery_text_unrecoverable:
      "Sans ces codes, votre compte ne peut pas être récupéré.",
    recovery_text_your_codes: "Vos codes",
    remove_alias_avatar: "Supprimer l'avatar de l'alias",
    remove_recovery_email: "Supprimer l'e-mail de récupération",
    step_up_description:
      "Pour votre sécurité, confirmez votre mot de passe pour continuer.",
    step_up_error:
      "Mot de passe ou code de vérification incorrect. Veuillez réessayer.",
    step_up_security_key_hint:
      "Après avoir saisi votre mot de passe, vous devrez vérifier votre identité avec votre clé de sécurité.",
    remove_recovery_email_confirm:
      "Confirmer la suppression de l'e-mail de récupération",
    reply_notification: "{{ sender }} a répondu",
    request_timed_out: "La requête a expiré",
    save_recovery_codes_dialog: "Enregistrer les codes de récupération",
    save_recovery_codes_title: "Codes de récupération",
    scanning_mailbox: "Analyse de la boîte aux lettres...",
    scheduled_category: "Programmé",
    search_failed_try_again: "La recherche a échoué. Veuillez réessayer.",
    search_load_failed_try_again:
      "Échec du chargement des résultats. Veuillez réessayer.",
    select_label: "Sélectionner une étiquette",
    select_none: "Aucune sélection",
    select_read: "Sélectionner les lus",
    select_starred: "Sélectionner les étoilés",
    select_unread: "Sélectionner les non lus",
    select_unstarred: "Sélectionner les non étoilés",
    sender_invalid: "Expéditeur invalide",
    sender_invalid_desc: "L'adresse de l'expéditeur n'a pas pu être vérifiée.",
    sender_no_keys: "Pas de clés pour l'expéditeur",
    sender_no_keys_desc:
      "Aucune clé de chiffrement trouvée pour cet expéditeur.",
    sender_unsigned: "Message non signé",
    sender_unsigned_desc: "Ce message n'est pas signé par l'expéditeur.",
    sender_verified: "Expéditeur vérifié",
    sender_verified_desc:
      "L'expéditeur a été vérifié via une signature cryptographique.",
    sending_in_seconds: "Envoi dans {{seconds}} secondes...",
    sending_in_one_second: "Envoi dans 1 seconde...",
    simple_toolbar: "Barre d'outils simple",
    star_selected: "Marquer la sélection d'une étoile",
    stop: "Arrêter",
    switch_to_advanced: "Passer en mode avancé",
    switch_to_simple: "Passer en mode simple",
    time_days_short: "j",
    time_hours_short: "h",
    time_minutes_short: "min",
    time_seconds_short: "s",
    to_recipient: "À",
    total_attachments_exceed_limit:
      "Vos pièces jointes dépassent la limite totale de {{size}}. Si vous supprimez un fichier ou le partagez via un lien, le reste sera envoyé.",
    trash_empty_failed: "Échec du vidage de la corbeille",
    uncategorized: "Non catégorisé",
    unknown_error: "Erreur inconnue",
    unknown_merchant: "Marchand inconnu",
    unknown_rotation_error: "Erreur de rotation inconnue",
    unsaved_changes_title: "Abandonner vos modifications ?",
    unsaved_changes_body:
      "Les informations que vous avez saisies ne sont pas enregistrées. Si vous fermez ce formulaire maintenant, elles sont supprimées.",
    unknown_sender: "Expéditeur inconnu",
    unlock_with_biometry: "Déverrouiller avec {{name}}",
    unpin_preferred_sender: "Désépingler l'expéditeur préféré",
    unstar_selected: "Retirer l'étoile de la sélection",
    unsupported_file_type:
      "{{name}} n'est pas un type de fichier pris en charge.",
    use_biometry_to_unlock: "Utiliser {{name}} pour déverrouiller",
    wkd_encrypted_description: "Ce message a été chiffré via WKD.",
    x_of_y: "{{current}} sur {{total}}",
    yourname_placeholder: "Votre nom",
    or: "ou",
    help: "Aide",
    go_to_inbox: "Aller à la boîte de réception",
    removing: "Suppression...",
    upgrade_tooltip:
      "Obtenez plus de stockage, d’alias et de domaines personnalisés",
    dns_host_leave_blank: "Laisser vide",
    dns_host_provider_hint:
      "{{provider}} utilise ce format pour le champ hôte. Copiez-le exactement tel quel.",
    purchase_congrats_title: "Félicitations",
    recipient_key_outdated: "La clé du destinataire est obsolète",
    recipient_key_outdated_desc:
      "La clé publiée de ce destinataire est expirée ou invalide : le message ne peut pas être chiffré de bout en bout. Il sera protégé uniquement pendant le transport.",
    post_quantum_unavailable_title: "Envoyer sans chiffrement post-quantique ?",
    post_quantum_send_anyway: "Envoyer quand même",
    post_quantum_unavailable_message:
      "{{recipients}} n’a pas encore publié de clés post-quantiques : ce message ne peut utiliser que le chiffrement de bout en bout standard. Demandez à cette personne d’ouvrir Aster ou de mettre à jour son app pour réactiver la protection post-quantique.",
    too_many_attachments:
      "Un e-mail peut contenir {{count}} pièces jointes. Envoyez le reste dans un autre e-mail.",
    more_folders_one: "{{count}} autre dossier",
    more_folders_other: "{{count}} autres dossiers",
    more_labels_one: "{{count}} autre libellé",
    more_labels_other: "{{count}} autres libellés",
    more_aliases_one: "{{count}} autre alias",
    more_aliases_other: "{{count}} autres alias",
    in_x_minutes_one: "Dans {{count}} minute",
    in_x_minutes_other: "Dans {{count}} minutes",
    minutes_remaining_one: "Il reste {{count}} minute",
    minutes_remaining_other: "Il reste {{count}} minutes",
    hours_remaining_one: "Il reste {{count}} heure",
    hours_remaining_other: "Il reste {{count}} heures",
    days_remaining_one: "Il reste {{count}} jour",
    days_remaining_other: "Il reste {{count}} jours",
    weeks_remaining_one: "Il reste {{count}} semaine",
    weeks_remaining_other: "Il reste {{count}} semaines",
    minutes_ago_long_one: "il y a {{count}} minute",
    minutes_ago_long_other: "il y a {{count}} minutes",
    hours_ago_long_one: "il y a {{count}} heure",
    hours_ago_long_other: "il y a {{count}} heures",
    days_ago_long_one: "il y a {{count}} jour",
    days_ago_long_other: "il y a {{count}} jours",
    weeks_ago_long_one: "il y a {{count}} semaine",
    weeks_ago_long_other: "il y a {{count}} semaines",
    months_ago_long_one: "il y a {{count}} mois",
    months_ago_long_other: "il y a {{count}} mois",
    emails_marked_as_read_one: "{{count}} e-mail marqué comme lu",
    emails_marked_as_read_other: "{{count}} e-mails marqués comme lus",
    emails_archived_one: "{{count}} e-mail archivé",
    emails_archived_other: "{{count}} e-mails archivés",
    emails_moved_to_trash_one: "{{count}} e-mail déplacé vers la corbeille",
    emails_moved_to_trash_other: "{{count}} e-mails déplacés vers la corbeille",
    emails_starred_one: "{{count}} e-mail marqué d'une étoile",
    emails_starred_other: "{{count}} e-mails marqués d'une étoile",
    emails_unstarred_one: "{{count}} e-mail sans étoile",
    emails_unstarred_other: "{{count}} e-mails sans étoile",
    emails_permanently_deleted_one: "{{count}} e-mail supprimé définitivement",
    emails_permanently_deleted_other:
      "{{count}} e-mails supprimés définitivement",
    emails_snoozed_until_one: "{{count}} e-mail reporté jusqu'à {{time}}",
    emails_snoozed_until_other: "{{count}} e-mails reportés jusqu'à {{time}}",
    emails_added_to_folder_one: "{{count}} e-mail ajouté à {{folder}}",
    emails_added_to_folder_other: "{{count}} e-mails ajoutés à {{folder}}",
    emails_will_reappear_one: "{{count}} e-mail réapparaîtra {{time}}",
    emails_will_reappear_other: "{{count}} e-mails réapparaîtront {{time}}",
    drafts_deleted_one: "{{count}} brouillon supprimé définitivement",
    drafts_deleted_other: "{{count}} brouillons supprimés définitivement",
    spam_emails_moved_to_trash_one:
      "{{count}} e-mail indésirable déplacé vers la corbeille",
    spam_emails_moved_to_trash_other:
      "{{count}} e-mails indésirables déplacés vers la corbeille",
    spam_emails_permanently_deleted_one:
      "{{count}} e-mail indésirable supprimé définitivement",
    spam_emails_permanently_deleted_other:
      "{{count}} e-mails indésirables supprimés définitivement",
    newsletters_archived_one: "{{count}} newsletter archivée",
    newsletters_archived_other: "{{count}} newsletters archivées",
    conversations_marked_as_spam_bulk_one:
      "{{count}} conversation marquée comme indésirable",
    conversations_restored_bulk_one: "{{count}} conversation restaurée",
    conversations_snoozed_bulk_one: "{{count}} conversation reportée",
    conversations_marked_as_read_bulk_one:
      "{{count}} conversation marquée comme lue",
    conversations_marked_as_unread_bulk_one:
      "{{count}} conversation marquée comme non lue",
    conversations_starred_bulk_one:
      "{{count}} conversation marquée d'une étoile",
    conversations_unstarred_bulk_one: "{{count}} conversation sans étoile",
    conversations_moved_to_inbox_bulk_one:
      "{{count}} conversation déplacée vers la boîte de réception",
    conversations_marked_as_not_spam_bulk_one:
      "{{count}} conversation marquée comme légitime",
    conversations_removed_from_folder_one:
      "{{count}} conversation retirée de {{folder}}",
    conversations_moved_to_folder_one:
      "{{count}} conversation déplacée vers {{folder}}",
    conversations_removed_label_one:
      "{{count}} conversation : libellé {{label}} retiré",
    conversations_added_label_one:
      "{{count}} conversation : libellé {{label}} ajouté",
    conversations_marked_as_spam_bulk_other:
      "{{count}} conversations marquées comme indésirables",
    conversations_restored_bulk_other: "{{count}} conversations restaurées",
    conversations_snoozed_bulk_other: "{{count}} conversations reportées",
    conversations_marked_as_read_bulk_other:
      "{{count}} conversations marquées comme lues",
    conversations_marked_as_unread_bulk_other:
      "{{count}} conversations marquées comme non lues",
    conversations_starred_bulk_other:
      "{{count}} conversations marquées d'une étoile",
    conversations_unstarred_bulk_other: "{{count}} conversations sans étoile",
    conversations_moved_to_inbox_bulk_other:
      "{{count}} conversations déplacées vers la boîte de réception",
    conversations_marked_as_not_spam_bulk_other:
      "{{count}} conversations marquées comme légitimes",
    conversations_removed_from_folder_other:
      "{{count}} conversations retirées de {{folder}}",
    conversations_moved_to_folder_other:
      "{{count}} conversations déplacées vers {{folder}}",
    conversations_removed_label_other:
      "{{count}} conversations : libellé {{label}} retiré",
    conversations_added_label_other:
      "{{count}} conversations : libellé {{label}} ajouté",
    contacts_deleted_one: "{{count}} contact supprimé",
    contacts_deleted_other: "{{count}} contacts supprimés",
    contacts_starred_one: "{{count}} contact marqué d'une étoile",
    contacts_starred_other: "{{count}} contacts marqués d'une étoile",
    contacts_unstarred_one: "Étoile retirée de {{count}} contact",
    contacts_unstarred_other: "Étoile retirée de {{count}} contacts",
    taps_to_developer_mode_one: "{{count}} appui avant le mode développeur",
    taps_to_developer_mode_other: "{{count}} appuis avant le mode développeur",
    delete_contacts_confirmation_one:
      "Voulez-vous vraiment supprimer {{count}} contact ? Cette action est irréversible.",
    delete_contacts_confirmation_other:
      "Voulez-vous vraiment supprimer {{count}} contacts ? Cette action est irréversible.",
    sender_count_one: "{{count}} expéditeur",
    sender_count_other: "{{count}} expéditeurs",
    email_count_one: "{{count}} e-mail",
    email_count_other: "{{count}} e-mails",
    entry_count_one: "{{count}} entrée",
    entry_count_other: "{{count}} entrées",
    file_count_one: "{{count}} fichier",
    file_count_other: "{{count}} fichiers",
    emails_from_senders_archived_one: "{{count}} e-mail archivé de {{senders}}",
    emails_from_senders_archived_other:
      "{{count}} e-mails archivés de {{senders}}",
    emails_from_senders_deleted_one: "{{count}} e-mail supprimé de {{senders}}",
    emails_from_senders_deleted_other:
      "{{count}} e-mails supprimés de {{senders}}",
    app_lock_attempts_remaining_one: "{{count}} tentative restante",
    app_lock_attempts_remaining_other: "{{count}} tentatives restantes",
    sender_count: "{{count}} expéditeurs",
    email_count: "{{count}} e-mails",
    entry_count: "{{count}} entrées",
    file_count: "{{count}} fichiers",
    images_count_one: "{{count}} image",
    images_count_other: "{{count}} images",
    contact_count: "{{count}} contacts",
    tray_show: "Afficher Aster Mail",
    tray_quit: "Quitter",
    tray_troubleshooting: "Si la fenêtre est vide",
    tray_compat_on: "Redémarrer en mode de compatibilité",
    tray_compat_off: "Redémarrer avec l'accélération matérielle",
    tray_display_reset: "Réinitialiser le cache d'affichage et redémarrer",
    push_new_message: "Vous avez un nouveau message",
    too_many_recipients_in_field:
      "Chaque champ À, Cc et Cci accepte au maximum {{max}} adresses. Déplacez-en une partie vers un second message pour envoyer celui-ci.",
    too_many_recipients_in_message:
      "Un message atteint au maximum {{max}} adresses entre À, Cc et Cci. Répartir la liste en messages plus petits permettra l'envoi.",
    credit_balance_changed:
      "Votre solde de crédits a changé pendant que le paiement était ouvert. Fermez le paiement et recommencez pour appliquer les crédits dont vous disposez maintenant.",
  },
  settings: {
    purge_locked_folder_on_delete: "Purger le contenu des dossiers protégés",
    purge_locked_folder_on_delete_description:
      "Présélectionne la destruction définitive des messages lorsque vous supprimez un dossier protégé par mot de passe",
    settings_view_mode: "Affichage des paramètres",
    settings_view_mode_description:
      "Ouvrir les paramètres en pleine page ou en fenêtre contextuelle",
    quick_settings: "Paramètres",
    see_all_settings: "Voir tous les paramètres",
    quick_inbox_list: "Liste de la boîte de réception",
    quick_layout: "Disposition",
    quick_more_appearance: "Plus de thèmes",
    quick_preview_text: "Texte d'aperçu",
    quick_sender_pictures: "Photos des expéditeurs",
    sender_pictures: "Photos des expéditeurs",
    sender_pictures_description:
      "Affiche la photo ou les initiales de l'expéditeur à côté de chaque message de votre boîte de réception.",
    fam_welcome_step1_title: "Bienvenue dans votre forfait famille",
    fam_welcome_step1_desc:
      "Chaque personne de votre famille dispose de sa propre boîte privée et chiffrée, complètement séparée de la vôtre.",
    fam_welcome_step1_point1:
      "Chaque membre reçoit sa propre adresse @astermail.org",
    fam_welcome_step1_point2:
      "Confidentialité totale : les membres ne peuvent pas voir les e-mails des autres",
    fam_welcome_step1_point3:
      "Chiffrement résistant au quantique sur chaque compte",
    fam_welcome_step2_title: "Un seul espace de stockage, sous votre contrôle",
    fam_welcome_step2_desc:
      "Votre forfait inclut un espace de stockage partagé. Décidez de la part de chaque membre et ajustez-la à tout moment.",
    fam_welcome_step2_point1:
      "Attribuez du stockage à chaque membre lors de son invitation",
    fam_welcome_step2_point2:
      "Déplacez le stockage entre les membres avec un curseur",
    fam_welcome_step2_point3:
      "Les membres ne voient que leur propre utilisation, rien d'autre",
    fam_welcome_step3_title: "La sécurité pour toute la famille",
    fam_welcome_step3_desc:
      "Définissez des règles qui s'appliquent à chaque membre : 2FA obligatoire, sessions limitées, accès contrôlé.",
    fam_welcome_step3_point1:
      "Exigez l'authentification à deux facteurs pour tous les membres",
    fam_welcome_step3_point2:
      "Définissez des délais de session et des limites d'appareils pour tous",
    fam_welcome_step3_point3:
      "Consultez les journaux d'activité et la conformité en un coup d'œil",
    fam_welcome_summary: "{{count}} membres · {{storage}}",
    fam_welcome_setup: "Configurer la famille",
    fam_welcome_step_aria: "Étape {{number}} : {{title}}",
    account_recovery_title: "Récupération du compte",
    account_recovery_desc:
      "Les méthodes qui vous permettent de retrouver l'accès à votre compte et de déverrouiller vos données chiffrées si vous oubliez votre mot de passe.",
    recovery_status_protected: "Restauration complète protégée",
    recovery_status_protected_desc:
      "Vous disposez d'une méthode de récupération des données. Oublier votre mot de passe ne vous fera pas perdre vos e-mails chiffrés.",
    recovery_status_at_risk:
      "À risque : aucune méthode de récupération hors ligne",
    recovery_status_at_risk_desc:
      "Sans codes de récupération, oublier votre mot de passe verrouille définitivement vos e-mails chiffrés.",
    recovery_codes_row: "Codes de récupération",
    recovery_codes_row_desc:
      "Six codes à usage unique qui restaurent votre compte et toutes vos données chiffrées.",
    recovery_codes_generate: "Générer les codes",
    recovery_codes_regenerate: "Régénérer les codes",
    recovery_codes_regenerate_warning:
      "La régénération crée de nouveaux codes et invalide définitivement les anciens.",
    recovery_method_active: "Actif",
    recovery_method_not_set: "Non défini",
    recovery_codes_saved_confirm:
      "Enregistrez les nouveaux codes avant de fermer. Ils ne sont affichés qu'une seule fois.",
    recovery_codes_saved_checkbox:
      "J'ai enregistré mes codes de récupération en lieu sûr.",
    recovery_codes_save_failed:
      "Vos codes de récupération n'ont pas pu être enregistrés sur le serveur. Réessayez.",
    legacy_phrase_row: "Phrase de récupération (ancienne)",
    legacy_phrase_row_desc:
      "Votre phrase de récupération existante reste valide. Les codes de récupération la remplacent désormais.",
    recovery_email_row_moved_hint:
      "Les paramètres de l'e-mail de récupération ont été déplacés vers Sécurité > Récupération du compte",
    recover_older_data_title: "Récupérer les données antérieures",
    recover_older_data_desc:
      "Ce compte a été réinitialisé. Si vous vous souvenez du mot de passe utilisé avant la réinitialisation, vos données chiffrées antérieures peuvent être déverrouillées et restaurées.",
    recover_older_data_button: "Déverrouiller les données antérieures",
    resurrection_old_password: "Ancien mot de passe",
    resurrection_old_password_prompt:
      "Saisissez le mot de passe que vous utilisiez avant la réinitialisation",
    resurrection_success:
      "Vos données antérieures sont déverrouillées. Les anciens messages et alias s'ouvrent de nouveau normalement.",
    resurrection_failed:
      "Cela n'a pas déverrouillé les données antérieures. Vérifiez le mot de passe ou la phrase et réessayez.",
    discard_older_data_button: "Abandonner les données antérieures",
    discard_older_data_title: "Abandonner les données antérieures ?",
    discard_older_data_desc: "Cette action supprime définitivement la possibilité de déverrouiller les e-mails et les alias antérieurs à la réinitialisation. Elle est irréversible.",
    discard_older_data_success: "Données antérieures abandonnées.",
    discard_older_data_failed: "Impossible d'abandonner les données antérieures. Réessayez.",
    phrase_wrap_save_failed:
      "Votre phrase de récupération n'a pas pu être enregistrée sur le serveur. Réessayez.",
    smtp_tokens: "Jetons SMTP",
    smtp_tokens_description:
      "Créez des identifiants SMTP en envoi seul pour que des applications et scripts externes puissent envoyer des messages depuis vos adresses de domaine personnalisé vérifiées.",
    smtp_tokens_popover_description:
      "Un jeton SMTP est un mot de passe en envoi seul lié à l'une de vos adresses de domaine personnalisé vérifiées. Utilisez-le pour envoyer des messages depuis des systèmes automatisés, des scripts ou des services tiers via le protocole SMTP standard.",
    smtp_tokens_empty: "Aucun jeton SMTP pour le moment.",
    smtp_tokens_upgrade_title: "Envoyez depuis vos propres applications",
    smtp_tokens_upgrade_description:
      "Générez des identifiants SMTP en envoi seul pour vos domaines personnalisés vérifiés. Disponible avec Star et au-delà.",
    smtp_tokens_upgrade_cta: "Passer à Star",
    smtp_tokens_no_domain_title:
      "Ajoutez d'abord un domaine personnalisé vérifié",
    smtp_tokens_no_domain_description:
      "Les jetons SMTP ne peuvent être liés qu'à une adresse de domaine personnalisé vérifiée. Ajoutez et vérifiez un domaine personnalisé pour commencer.",
    smtp_tokens_add_domain_cta: "Ajouter un domaine personnalisé",
    smtp_token_generate: "Générer un jeton",
    smtp_token_create_title: "Générer un jeton SMTP",
    smtp_token_create_description:
      "Nommez ce jeton et choisissez l'adresse vérifiée depuis laquelle il peut envoyer des messages.",
    smtp_token_name_label: "Nom",
    smtp_token_name_placeholder: "ex. Expéditeur de newsletter",
    smtp_token_address_label: "Envoyer depuis",
    smtp_token_address_hint:
      "Les messages envoyés avec ce jeton sembleront provenir de cette adresse.",
    smtp_token_create_failed:
      "Impossible de créer le jeton. Veuillez réessayer.",
    smtp_token_error_forbidden:
      "Les jetons SMTP nécessitent un forfait payant, ou vous avez atteint votre limite de jetons. Mettez à niveau votre forfait ou révoquez un jeton existant pour continuer.",
    smtp_token_error_conflict:
      "Un jeton actif existe déjà pour cette adresse. Révoquez-le d'abord pour en générer un nouveau.",
    smtp_token_ready_title: "Jeton créé",
    smtp_token_ready_description:
      "Copiez ces paramètres dans votre client de messagerie ou votre application dès maintenant. Le mot de passe n'est affiché qu'une seule fois et ne pourra pas être récupéré ultérieurement.",
    smtp_token_host: "Hôte",
    smtp_token_port: "Port",
    smtp_token_security: "Sécurité",
    smtp_token_username: "Nom d'utilisateur",
    smtp_token_password: "Mot de passe",
    smtp_token_copy_all: "Tout copier",
    smtp_token_last_used: "Dernière utilisation",
    smtp_token_never_used: "Jamais",
    smtp_token_revoke_title: "Révoquer le jeton ?",
    smtp_token_revoke_message:
      "Cette action révoquera définitivement {{ name }}. Toute application l'utilisant ne pourra plus envoyer de messages.",
    smtp_token_revoked_toast: "Jeton SMTP révoqué",
    smtp_token_revoke_failed_toast:
      "Impossible de révoquer le jeton SMTP. Veuillez réessayer.",
    smtp_token_not_e2e_title:
      "Les messages envoyés avec des jetons SMTP ne sont pas chiffrés de bout en bout",
    smtp_token_not_e2e_body:
      "Les e-mails envoyés via un jeton SMTP sont protégés par TLS en transit et stockés avec un chiffrement à accès zéro sur nos serveurs, mais ils ne sont pas chiffrés de bout en bout. Aster ne peut pas appliquer le chiffrement de bout en bout aux messages provenant de l'extérieur des applications Aster. N'utilisez les jetons SMTP que pour des messages automatisés ou transactionnels où le chiffrement de bout en bout n'est pas requis.",
    fam_org_sec_member_notice:
      "Ces règles de sécurité sont définies par le propriétaire du plan et s'appliquent à votre compte.",
    fam_org_sec_saved: "Paramètres de sécurité mis à jour",
    fam_org_sec_unsaved: "Vous avez des modifications non enregistrées",
    fam_org_sec_discard: "Ignorer",
    fam_org_sec_apply: "Appliquer les modifications",
    fam_org_sec_confirm_title: "Appliquer les paramètres de sécurité ?",
    fam_org_sec_confirm_desc:
      "Ces modifications s'appliqueront immédiatement à tous les membres.",
    fam_org_sec_confirm_on: "Activé",
    fam_org_sec_confirm_off: "Désactivé",
    fam_org_sec_confirm_cancel: "Annuler",
    fam_org_sec_confirm_apply: "Appliquer",
    fam_org_event_group_member_added: "Membre ajouté au groupe",
    fam_org_event_group_member_removed: "Membre retiré du groupe",
    fam_org_captcha_required:
      "Veuillez compléter le captcha pour envoyer une invitation.",
    fam_org_left_title: "Vous avez quitté le plan familial",
    fam_org_left_desc:
      "Votre compte reste actif. Vous pouvez rejoindre à tout moment avec une nouvelle invitation.",
    fam_org_invite_summary:
      "Ce membre reçoit {{member}}. Il restera {{free}} sur votre pool familial de {{pool}} pour les autres.",
    fam_org_invite_summary_over:
      "{{member}} dépasse la capacité de votre pool familial. Seulement {{avail}} disponible ; choisissez une valeur plus petite.",
    fam_org_action_failed: "Une erreur est survenue. Veuillez réessayer.",
    fam_org_invite_exists:
      "Une invitation est déjà en attente pour cette adresse e-mail.",
    plan_desc_ghost_aliases:
      "Envoyez depuis une adresse aléatoire qui masque votre identité",
    plan_desc_advanced_aliases:
      "Avatars, épinglage d'expéditeurs et règles par alias",
    plan_desc_catch_all:
      "Recevez les messages envoyés à n'importe quelle adresse de votre domaine",
    plan_desc_apps:
      "Connectez n'importe quelle app de messagerie via Aster Bridge",
    plan_desc_vanguard:
      "Protection renforcée contre l'hameçonnage et les traqueurs",
    plan_desc_smart_folders: "Des dossiers qui se remplissent selon vos règles",
    plan_desc_folder_lock:
      "Verrouillez vos dossiers privés avec un second mot de passe",
    plan_desc_external_accounts: "Consultez vos autres boîtes mail dans Aster",
    plan_desc_alias_directory:
      "De nouveaux alias se créent à l'arrivée des messages",
    plan_desc_multi_accounts:
      "Restez connecté à plusieurs comptes en même temps",
    plan_desc_instant_alias_delete:
      "Supprimez des alias sans attendre 30 jours",
    plan_desc_encrypted_exports:
      "Téléchargez votre courrier dans une archive chiffrée",
    plan_desc_support_dedicated:
      "Chat en direct avec un contact qui connaît votre compte",
    plan_desc_early_access: "Essayez les nouveautés avant tout le monde",
    plan_feat_storage_50: "50 Go de stockage chiffré",
    plan_feat_storage_500: "500 Go de stockage chiffré",
    plan_feat_storage_5tb: "5 To de stockage chiffré",
    plan_feat_aliases_15: "15 alias e-mail",
    plan_feat_aliases_unlimited: "Illimité alias e-mail",
    plan_feat_domains_5: "5 domaines personnalisés",
    plan_feat_domains_30: "30 domaines personnalisés",
    plan_feat_domains_unlimited: "Illimité domaines personnalisés",
    plan_feat_attachments_50: "50 Mo de pièces jointes",
    plan_feat_attachments_100: "100 Mo de pièces jointes",
    plan_feat_attachments_250: "250 Mo de pièces jointes",
    plan_feat_mail_rules_unlimited: "Illimité règles de courrier",
    plan_feat_e2ee: "Chiffrement de bout en bout",
    plan_feat_zero_knowledge: "Architecture zéro accès",
    plan_feat_tracker: "Blocage des traqueurs et des images distantes",
    plan_feat_advanced_aliases: "Alias avancés",
    plan_feat_catch_all: "Adresse e-mail attrape-tout",
    plan_feat_auto_forward: "Transfert automatique et réponse d'absence",
    plan_feat_priority_support: "Support prioritaire",
    plan_feat_imap_smtp:
      "Utilisez votre app de messagerie préférée (via Aster Bridge)",
    plan_feat_folder_lock: "Verrouillage de dossier",
    plan_feat_smart_folders: "Dossiers intelligents",
    plan_feat_vanguard: "Aster Vanguard",
    plan_feat_read_receipts: "Accusés de lecture",
    fam_org_invite_pool_title: "Espace de stockage familial",
    fam_org_invite_alloc: "Alloué",
    fam_org_invite_this_member: "Ce membre",
    fam_org_invite_available: "Disponible",
    fam_org_invite_over: "Dépasse la limite du pool",
    app_lock_attempts_remaining: "{{count}} tentatives restantes",
    app_lock_choose_mode: "Choisir le type de verrouillage",
    app_lock_mode_numeric: "Code PIN numérique",
    app_lock_mode_numeric_desc: "Utiliser un code chiffré",
    app_lock_mode_text: "Phrase secrète",
    app_lock_mode_text_desc: "Utiliser une phrase secrète personnalisée",
    app_lock_set_passphrase: "Définir la phrase secrète",
    app_lock_confirm_passphrase: "Confirmer la phrase secrète",
    app_lock_text_placeholder: "Saisissez la phrase secrète",
    app_lock_passphrase_mismatch:
      "Les phrases secrètes ne correspondent pas. Réessayez.",
    app_lock_passphrase_too_short:
      "La phrase secrète doit comporter au moins 4 caractères",
    duress_pin: "Code de contrainte",
    duress_pin_description:
      "Un code masqué qui efface les données locales au lieu de déverrouiller l’app",
    duress_pin_setup: "Configurer",
    duress_pin_change: "Modifier le code de contrainte",
    duress_pin_remove: "Retirer",
    duress_pin_verify_identity: "Vérifiez votre identité",
    duress_pin_verify_identity_desc:
      "Saisissez le mot de passe de votre compte pour configurer un code de contrainte.",
    duress_pin_verify_identity_totp_desc:
      "Saisissez le mot de passe de votre compte et votre code d’authentification à deux facteurs.",
    duress_pin_password_label: "Mot de passe du compte",
    duress_pin_totp_label: "Code d’authentification à deux facteurs",
    duress_pin_set: "Définir le code de contrainte",
    duress_pin_confirm: "Confirmez le code de contrainte",
    duress_pin_enabled_toast: "Code de contrainte défini",
    duress_pin_disabled_toast: "Code de contrainte supprimé",
    duress_pin_cleared_length_change:
      "Votre code de contrainte a été supprimé car le format de verrouillage a changé. Configurez-le à nouveau.",
    duress_pin_changed_toast: "Code de contrainte mis à jour",
    duress_pin_matches_regular:
      "Le code de contrainte ne peut pas être identique à votre code habituel",
    duress_pin_enter_to_remove:
      "Saisissez votre code de contrainte pour le retirer",
    duress_pin_invalid_credentials:
      "Mot de passe ou code d’authentification incorrect",
    duress_pin_how_it_works: "Fonctionnement du code de contrainte",
    duress_pin_how_it_works_body:
      "Si vous saisissez ce code sur l’écran de verrouillage, Aster Mail efface immédiatement toutes les données stockées sur cet appareil et vous déconnecte. Votre compte n’est pas supprimé : vos e-mails et données chiffrés restent sur les serveurs d’Aster et sont restaurés dès que vous vous reconnectez.",
    duress_pin_confirm_setup: "Configurer le code de contrainte",
    inbox_categories: "Catégories de la boîte de réception",
    inbox_categories_short: "Triez votre boîte de réception en onglets",
    inbox_categories_description:
      "Trie votre boîte de réception dans les onglets Principal, Promotions, Réseaux sociaux et Mises à jour. Le tri s'effectue de façon privée sur votre appareil - les catégories ne sont jamais envoyées au serveur.",
    categories_title: "Catégories",
    categories_description:
      "Choisissez les onglets de catégorie qui apparaissent dans votre boîte de réception et créez les vôtres. Tout le tri se fait localement sur votre appareil.",
    category_forums: "Discussions",
    category_finance: "Finances",
    category_travel: "Voyages",
    category_shopping: "Achats",
    category_info_primary:
      "Tout ce qui ne correspond à aucune autre catégorie. Toujours active.",
    category_info_promotions: "E-mails marketing, offres et promotions.",
    category_info_social: "Notifications des réseaux sociaux et communautés.",
    category_info_updates: "Reçus, confirmations et notifications de service.",
    category_info_forums:
      "Messages des listes de diffusion, forums et groupes de discussion.",
    category_info_finance:
      "Relevés, factures et alertes des banques et services financiers.",
    category_info_travel:
      "Réservations, itinéraires et confirmations des compagnies aériennes, hôtels et services de transport.",
    category_info_shopping:
      "Confirmations de commande, mises à jour de livraison et avis de livraison.",
    category_info_custom:
      "E-mails correspondant à vos règles personnalisées pour cette catégorie.",
    muted_categories: "Catégories en sourdine",
    muted_categories_description:
      "Activez une catégorie pour mettre ses notifications en sourdine. Les catégories en sourdine continuent de recevoir des e-mails et apparaissent dans votre boîte de réception.",
    muted_categories_empty:
      "Activez les catégories de boîte de réception pour choisir celles à mettre en sourdine.",
    custom_categories_title: "Catégories personnalisées",
    custom_categories_tutorial:
      "Créez votre propre catégorie. Faites correspondre les e-mails par domaine de l'expéditeur ou par un mot-clé de l'objet.",
    custom_category_locked_badge: "Verrouillé",
    add_category: "Ajouter une catégorie",
    no_custom_categories: "Aucune catégorie personnalisée pour l'instant.",
    category_name_required: "Saisissez un nom pour cette catégorie.",
    category_rule_required:
      "Ajoutez au moins un domaine ou un mot-clé à faire correspondre.",
    template_name_required: "Saisissez un nom pour ce modèle.",
    template_content_required: "Ajoutez du contenu à ce modèle.",
    category_domains_invalid:
      "Domaines non valides : {{list}}. Utilisez un domaine réel comme example.com.",
    category_keywords_invalid:
      "Mots-clés non valides : {{list}}. Utilisez uniquement des mots simples.",
    category_expand: "Développer",
    category_collapse: "Réduire",
    delete_category_title: "Supprimer la catégorie ?",
    delete_category_description:
      "Voulez-vous vraiment supprimer « {{name}} » ? Cette action est irréversible.",
    custom_categories_locked:
      "Les catégories personnalisées ne sont pas disponibles avec votre forfait actuel.",
    custom_categories_limit_reached:
      "Vous avez atteint la limite de catégories personnalisées de votre forfait. Passez à un forfait supérieur pour en ajouter davantage.",
    edit_custom_category: "Modifier la catégorie",
    new_custom_category: "Nouvelle catégorie",
    category_name: "Nom",
    category_name_placeholder: "ex. Newsletters",
    category_icon: "Icône",
    category_color: "Couleur",
    category_color_accent: "Accent",
    category_color_blue: "Bleu",
    category_color_green: "Vert",
    category_color_amber: "Ambre",
    category_color_violet: "Violet",
    category_color_teal: "Sarcelle",
    category_color_cyan: "Cyan",
    category_color_rose: "Rose",
    category_color_pink: "Fuchsia",
    category_color_slate: "Ardoise",
    category_match_domains: "Faire correspondre les domaines de l'expéditeur",
    category_match_domains_placeholder: "example.com, news.example.org",
    category_match_domains_help:
      "Liste de domaines d'expéditeur séparés par des virgules. Les e-mails de ces domaines iront dans cette catégorie.",
    category_match_keywords: "Faire correspondre les mots-clés de l'objet",
    category_match_keywords_placeholder: "newsletter, résumé",
    category_match_keywords_help:
      "Mots séparés par des virgules. Si l'un d'eux apparaît dans l'objet, l'e-mail ira dans cette catégorie.",
    category_tutorial_text:
      "Astuce : une catégorie personnalisée correspond si le domaine de l'expéditeur OU l'objet contient l'un de vos mots-clés. Les catégories personnalisées sont vérifiées avant les catégories intégrées, elles sont donc toujours prioritaires.",
    html_content_section_title: "Contenu HTML",
    html_rendering_mode_label: "Bloquer le rendu HTML",
    html_rendering_mode_description:
      "Affiche les e-mails entrants en texte brut pour empêcher le pistage, l'usurpation de mise en page et l'hameçonnage visuel",
    plain_text_compose_label: "Rédiger en texte brut",
    plain_text_compose_description:
      "Utiliser le texte brut par défaut lors de la rédaction de nouveaux e-mails",
    family_plan_title: "Forfait Famille",
    family_plan_subtitle:
      "Gérez les membres de votre groupe familial et le stockage",
    family_members: "Membres",
    family_storage_pool: "Pool de stockage",
    family_storage_allocated: "{{used}} sur {{total}} alloué",
    family_invite_member: "Inviter un membre",
    family_invite_link: "Copier le lien d'invitation",
    family_invite_by_email: "Inviter par e-mail",
    family_invite_email_placeholder: "membre@exemple.com",
    family_invite_storage: "Stockage pour ce membre",
    family_invite_send: "Envoyer l'invitation",
    family_invite_copy_link: "Copier le lien",
    family_invite_sent: "Invitation envoyée",
    family_invite_link_copied: "Lien d'invitation copié",
    family_invite_expires: "Expire le {{date}}",
    family_invite_pending: "En attente",
    family_invite_revoke: "Révoquer",
    family_invite_wrong_recipient:
      "Cette invitation a été envoyée à une autre adresse. Demandez à l’expéditeur de partager le lien directement.",
    family_member_owner: "Propriétaire",
    family_member_member: "Membre",
    family_member_grace: "Période de grâce",
    family_member_storage: "{{used}} sur {{limit}} utilisé",
    family_remove_member: "Retirer le membre",
    family_remove_confirm_title: "Retirer {{name}} ?",
    family_remove_confirm_body:
      "{{name}} disposera de 30 jours d'accès avant que son forfait ne repasse à Gratuit. Ses e-mails et ses données lui restent acquis.",
    family_remove_confirm_action: "Retirer le membre",
    family_transfer_admin: "Transférer l'administration",
    family_transfer_confirm_title: "Transférer l'administration à {{name}} ?",
    family_transfer_confirm_body:
      "{{name}} deviendra le propriétaire du groupe et gérera la facturation. Vous deviendrez un membre ordinaire.",
    family_transfer_confirm_action: "Transférer l'administration",
    family_leave: "Quitter le forfait Famille",
    family_leave_confirm_title: "Quitter le forfait Famille ?",
    family_leave_confirm_body:
      "Vous disposerez de 30 jours d'accès avant que votre forfait ne repasse à Gratuit. Vos e-mails et vos données vous restent acquis.",
    family_leave_confirm_action: "Quitter",
    family_join_title: "Rejoindre un forfait Famille sur Aster Mail",
    family_join_body:
      "Vous avez été invité à rejoindre un forfait e-mail familial privé et chiffré.",
    family_join_create_account: "Créer un compte et rejoindre",
    family_join_login: "Se connecter et rejoindre",
    family_join_invalid: "Ce lien d'invitation a expiré ou n'est plus valide.",
    invite_title_named: "{{ name }} vous a invité sur Aster Mail",
    invite_title_generic: "Vous avez été invité sur Aster Mail",
    invite_subtitle:
      "Aster Mail est une messagerie chiffrée de bout en bout et à accès zéro. Personne d'autre que vous ne peut lire votre boîte de réception, pas même nous.",
    invite_discount_line:
      "Inscrivez-vous maintenant et bénéficiez de {{ percent }}% de réduction sur votre premier abonnement.",
    invite_benefits_heading: "Ce que vous obtenez",
    invite_benefit_zero_access:
      "Messagerie chiffrée de bout en bout, à accès zéro",
    invite_benefit_no_ads: "Sans publicité, sans traçage",
    invite_benefit_open_source: "Open source et audité",
    invite_cta_create_account: "Profiter de {{ percent }}% de réduction",
    invite_cta_sign_in: "Vous avez déjà un compte ? Se connecter",
    invite_not_found_title: "Ce lien d'invitation n'est pas disponible",
    invite_not_found_body:
      "Il a peut-être expiré, ou le lien est incorrect. Vous pouvez tout de même créer un compte Aster Mail gratuit.",
    invite_not_found_cta_register: "Créer votre compte",
    invite_not_found_cta_sign_in: "Se connecter",
    family_join_inviter: "{{ name }} vous a invité",
    family_join_shared_storage: "stockage partagé",
    family_join_storage_suffix: "{{ size }} de stockage",
    family_join_benefits_heading: "Ce que vous obtenez",
    family_join_benefit_private_inbox:
      "Votre propre boîte de réception privée et chiffrée",
    family_join_benefit_separate: "Séparée des autres membres de la famille",
    family_join_benefit_e2e: "E-mail chiffré de bout en bout",
    family_join_benefit_no_tracking: "Pas de publicité, pas de suivi",
    family_join_2fa_title: "Exigence de sécurité",
    family_join_2fa_body:
      "Cette famille requiert l'authentification à deux facteurs. Vous devrez activer la 2FA après votre adhésion.",
    family_join_accept: "Accepter et rejoindre",
    family_join_joining: "Adhésion...",
    family_join_success_title: "Vous y êtes !",
    family_join_success_body:
      "Vous avez rejoint le forfait Famille avec {{ size }} de stockage.",
    family_join_redirecting: "Redirection vers votre boîte de réception...",
    family_join_invalid_title: "Invitation non valide",
    family_join_invalid_link: "Lien d'invitation non valide.",
    family_join_failed:
      "Nous n'avons pas pu vous ajouter à cette famille. L'invitation a peut-être expiré ou a déjà été utilisée.",
    family_join_sign_in_cta: "Se connecter à Aster",
    family_join_terms_prefix: "En rejoignant, vous acceptez nos",
    family_join_terms_link: "Conditions d'utilisation",
    family_join_terms_and: "et",
    family_join_privacy_link: "Politique de confidentialité",
    family_plan_grace:
      "Ce forfait est en période de grâce et prendra fin le {{date}}.",
    family_storage_edit: "Modifier le stockage",
    family_storage_save: "Enregistrer",
    family_seats_used: "{{used}} sur {{max}} places utilisées",
    plan_type_individual: "Individuel",
    plan_type_family: "Famille",
    family_duo_tagline: "2 membres - couples et partenaires",
    family_plan_tagline: "Jusqu'à 6 membres",
    family_shared_aliases: "Alias familiaux partagés",
    family_feat_members_2: "2 membres, comptes séparés",
    family_feat_members_6: "Jusqu'à 6 membres, comptes séparés",
    family_feat_everything_nova: "Tout Nova, pour chaque membre",
    family_feat_everything_supernova: "Tout Supernova, pour chaque membre",
    family_feat_pool_1tb: "1 To partagé, alloué en privé à chaque membre",
    family_feat_pool_3tb: "3 To partagés, alloués en privé à chaque membre",
    family_feat_invite: "Invitation par lien ou par e-mail",
    family_feat_domain_sharing: "Partage de domaines entre les membres",
    family_feat_security_policies: "Politiques de sécurité (2FA obligatoire)",
    family_feat_admin_transfer: "Transfert du rôle d'administrateur",
    family_feat_org_groups: "Groupes et listes de diffusion",
    family_feat_activity_log: "Journal d'activité et piste d'audit",
    family_feat_org_filters: "Filtres d'e-mail à l'échelle de l'organisation",
    family_feat_retention: "Politiques de conservation des données",
    family_feat_storage_controls: "Contrôles de stockage par membre",
    family_admin_controls:
      "Contrôles de stockage par membre pour l'administrateur",
    family_tab_overview: "Aperçu",
    family_tab_members: "Membres",
    family_tab_groups: "Groupes",
    family_tab_activity: "Activité",
    family_tab_filters: "Filtres",
    family_tab_domains: "Domaines",
    family_tab_security: "Sécurité",
    family_tab_retention: "Conservation",
    family_groups_empty: "Aucun groupe pour le moment.",
    family_groups_create: "Créer",
    family_groups_name_placeholder: "Nom du groupe",
    family_groups_email_prefix_placeholder: "Préfixe d'e-mail (facultatif)",
    family_groups_no_members: "Aucun membre pour le moment.",
    family_groups_add_member: "Ajouter un membre",
    family_groups_created: "Groupe créé",
    family_groups_deleted: "Groupe supprimé",
    family_groups_member_added: "Membre ajouté",
    family_groups_member_removed: "Membre retiré",
    family_groups_load_failed: "Échec du chargement des groupes",
    family_groups_create_failed: "Échec de la création du groupe",
    family_groups_delete_failed: "Échec de la suppression du groupe",
    family_activity_events: "{{count}} événements",
    family_activity_events_plural: "{{count}} événements",
    family_activity_all_events: "Tous les événements",
    family_activity_empty: "Aucune activité pour le moment.",
    family_activity_load_more: "Charger plus",
    family_activity_load_failed: "Échec du chargement de l'activité",
    family_filters_subtitle:
      "Les filtres s'appliquent aux boîtes de réception de tous les membres de la famille.",
    family_filters_new: "Nouveau filtre",
    family_filters_name_placeholder: "Nom du filtre",
    family_filters_value_placeholder: "Valeur (domaine, e-mail, mot-clé)",
    family_filters_field_from: "Expéditeur (de)",
    family_filters_field_to: "Destinataire (à)",
    family_filters_field_domain: "Domaine",
    family_filters_field_subject: "Objet",
    family_filters_action_trash: "Mettre à la corbeille",
    family_filters_action_block: "Bloquer",
    family_filters_action_archive: "Archiver",
    family_filters_action_mark_read: "Marquer comme lu",
    family_filters_create: "Créer le filtre",
    family_filters_empty: "Aucun filtre d'organisation pour le moment.",
    family_filters_created: "Filtre créé",
    family_filters_deleted: "Filtre supprimé",
    family_filters_load_failed: "Échec du chargement des filtres",
    family_filters_create_failed: "Échec de la création du filtre",
    family_domains_subtitle:
      "Partagez des domaines personnalisés pour que les membres de la famille puissent y créer des alias.",
    family_domains_empty:
      "Aucun domaine personnalisé trouvé. Les membres peuvent ajouter des domaines dans les paramètres Alias et domaines.",
    family_domains_share: "Partager",
    family_domains_shared: "Domaine partagé",
    family_domains_share_failed: "Échec du partage du domaine",
    family_domains_load_failed: "Échec du chargement des domaines",
    family_domains_select_member: "Sélectionner un membre...",
    family_security_require_2fa: "Exiger l'authentification à deux facteurs",
    family_security_require_2fa_hint:
      "Tous les membres doivent activer la 2FA pour accéder à leur compte",
    family_security_allow_imap: "Autoriser l'accès IMAP/SMTP",
    family_security_allow_imap_hint:
      "Les membres peuvent connecter des clients de messagerie tiers via Aster Bridge",
    family_security_block_forwarding: "Bloquer la redirection externe",
    family_security_block_forwarding_hint:
      "Empêcher les membres de rediriger automatiquement les e-mails en dehors de la famille",
    family_security_grace_label: "Période de grâce pour les nouveaux membres",
    family_security_grace_hint:
      "Nombre de jours avant l'application de la 2FA après l'adhésion",
    family_security_max_sessions: "Sessions actives maximales par membre",
    family_security_max_sessions_hint:
      "Limitez les connexions simultanées par appareil. Laissez vide pour aucune limite.",
    family_security_session_timeout: "Déconnexion automatique après",
    family_security_session_timeout_hint:
      "Déconnecter les membres après N heures d'inactivité.",
    family_security_save: "Enregistrer la politique de sécurité",
    family_security_saved: "Politique de sécurité enregistrée",
    family_security_save_failed:
      "Échec de l'enregistrement de la politique de sécurité",
    family_security_load_failed:
      "Échec du chargement des paramètres de sécurité",
    family_security_compliance: "Conformité des membres",
    family_security_warning_2fa:
      "{{count}} membres n'ont pas activé l'authentification à deux facteurs",
    family_security_warning_2fa_plural:
      "{{count}} membres n'ont pas activé la 2FA",
    family_retention_subtitle:
      "Purgez automatiquement les anciens messages après un nombre de jours défini. Laissez vide pour les conserver indéfiniment.",
    family_retention_trash: "Corbeille",
    family_retention_trash_hint:
      "Supprimer automatiquement les e-mails à la corbeille",
    family_retention_spam: "Indésirables",
    family_retention_spam_hint:
      "Supprimer automatiquement le spam (30 jours par défaut)",
    family_retention_sent: "Envoyés",
    family_retention_sent_hint: "Supprimer automatiquement les e-mails envoyés",
    family_retention_all_mail: "Tous les messages",
    family_retention_all_mail_hint: "Limite stricte sur tous les messages",
    family_retention_enforce: "Appliquer à tous les membres",
    family_retention_enforce_hint:
      "Appliquer ces politiques à chaque compte de cette famille",
    family_retention_save: "Enregistrer la politique de conservation",
    family_retention_saved: "Politique de conservation enregistrée",
    family_retention_save_failed:
      "Échec de l'enregistrement de la politique de conservation",
    family_retention_load_failed:
      "Échec du chargement des paramètres de conservation",
    family_per_member: "Par membre",
    family_seat_upgrade_msg:
      "Les {{count}} places sont toutes utilisées. Passez au forfait Famille pour accueillir jusqu'à 6 membres.",
    family_billing_section: "Facturation",
    family_billing_empty: "Aucun historique de facturation pour le moment.",
    family_billing_view_all: "Voir toute la facturation",
    family_setting_up: "Configuration de votre forfait Famille...",
    family_storage_updated: "Stockage mis à jour",
    family_plan_billing_notice:
      "Vous êtes sur le forfait {{plan_name}}. Gérez les membres, le stockage et les paramètres dans l'onglet Famille.",
    go_to_family_settings: "Accéder aux paramètres Famille",
    category_advanced_aliases: "Alias avancés",
    feature_extra_alias_domains: "Domaines d'alias supplémentaires",
    feature_alias_sender_pinning: "Épinglage d'expéditeur",
    feature_per_alias_rules: "Règles par alias (blocage et filtrage)",
    feature_alias_stats_restore: "Statistiques et restauration d'alias",
    feature_soft_delete_restore: "Suppression réversible et restauration",
    feature_alias_directory: "Création automatique par répertoire",
    feature_instant_alias_delete: "Suppression instantanée des alias",
    feature_reverse_alias: "Répondre depuis l'alias",
    first_addon_discount_applied:
      "Vos {{months}} premiers mois bénéficient de {{percent}} % de réduction",
    first_addon_discount_applied_singular:
      "Votre premier mois bénéficie de {{percent}} % de réduction",
    credits_will_be_applied:
      "{{amount}} de crédits seront appliqués au paiement",
    minimize_sidebar: "Réduire la barre latérale",
    minimize_sidebar_description:
      "Réduisez la barre latérale en icônes pour gagner de la place",
    create_alias_display_name_label: "Nom d'affichage (facultatif)",
    create_alias_display_name_placeholder: "Affiché comme nom de l'expéditeur",
    create_alias_note_label: "Note (facultative)",
    create_alias_note_placeholder: "Vous seul pouvez voir ceci",
    alias_availability_on_save:
      "La disponibilité est vérifiée lors de l'enregistrement.",
    alias_decrypt_failed_title: "Cet alias n'a pas pu être déchiffré",
    alias_decrypt_failed_hint:
      "Ses détails sont indisponibles sur cet appareil. Une reconnexion ou la restauration de vos clés résout généralement le problème.",
    alias_orphaned_title: "Cet alias reçoit toujours du courrier",
    alias_orphaned_hint:
      "Son libellé a été chiffré avec votre mot de passe précédent, cet appareil ne peut donc pas le lire. Si vous vous souvenez de l’adresse, vous pouvez restaurer le libellé. Le courrier envoyé à cette adresse arrive toujours, et l’adresse complète figure dans l’en-tête de chaque message qu’il distribue.",
    alias_restore_action: "Restaurer cet alias",
    alias_restore_prompt:
      "Saisissez l’adresse. Aster la compare à cet alias avant de restaurer le libellé.",
    alias_restore_placeholder: "Adresse",
    alias_restore_confirm: "Restaurer",
    alias_restore_mismatch:
      "Cette adresse ne correspond pas à cet alias. Consultez l’en-tête d’un message qu’il a distribué.",
    alias_restore_failed: "L’alias n’a pas été restauré. Réessayez.",
    recently_deleted_load_failed:
      "Nous n'avons pas pu charger vos alias récemment supprimés. Une nouvelle tentative devrait fonctionner.",
    ghost_aliases_info:
      "Les alias éphémères sont temporaires et expirent automatiquement. Utilisez-les pour des inscriptions ponctuelles ou partout où vous ne voulez pas d'adresse permanente. Ils disparaissent d'eux-mêmes - aucun nettoyage nécessaire.",
    recently_deleted_aliases_title: "Récemment supprimés",
    recently_deleted_aliases_description:
      "Restaurez un alias que vous avez supprimé. Les alias supprimés sont conservés pendant une durée limitée.",
    recently_deleted_aliases_empty: "Aucun alias récemment supprimé",
    alias_deleted_at: "Supprimé le {{ date }}",
    restore_alias_action: "Restaurer",
    alias_restored: "Alias restauré",
    failed_restore_alias:
      "Cet alias n'a pas été restauré. Une nouvelle tentative devrait fonctionner.",
    recently_deleted_empty_trash: "Vider la corbeille",
    delete_alias_permanently_action: "Supprimer définitivement",
    purge_alias_confirm_title: "Supprimer définitivement l'alias ?",
    purge_alias_confirm_message:
      "Supprimer définitivement {{ address }} ? Cette action est irréversible. L'adresse reste réservée à votre compte, de sorte que personne d'autre ne pourra jamais la revendiquer.",
    alias_purged: "Alias supprimé définitivement",
    failed_purge_alias: "Cet alias n'a pas été supprimé. Veuillez réessayer.",
    empty_trash_confirm_title: "Vider les éléments récemment supprimés ?",
    empty_trash_confirm_message:
      "Supprimer définitivement les {{ count }} alias dans Récemment supprimés ? Cette action est irréversible. Les adresses restent réservées à votre compte, de sorte que personne d'autre ne pourra les revendiquer.",
    trash_emptied: "Éléments récemment supprimés vidés",
    failed_empty_trash:
      "Impossible de vider Récemment supprimés. Veuillez réessayer.",
    recently_deleted_directories_title: "Récemment supprimés",
    recently_deleted_directories_description:
      "Restaurez un répertoire supprimé. Les répertoires supprimés ne reçoivent plus de nouveaux e-mails tant qu'ils ne sont pas restaurés.",
    directory_restored: "Répertoire restauré",
    failed_restore_directory:
      "Ce répertoire n'a pas été restauré. Une nouvelle tentative devrait suffire.",
    purge_directory_confirm_title: "Supprimer définitivement le répertoire ?",
    purge_directory_confirm_message:
      "Supprimer définitivement {{ key }}@{{ domain }} ? Cette action est irréversible. Le répertoire reste réservé à votre compte, personne d'autre ne pourra jamais le réclamer.",
    directory_purged: "Répertoire supprimé définitivement",
    failed_purge_directory:
      "Ce répertoire n'a pas été supprimé. Veuillez réessayer.",
    empty_directory_trash_confirm_message:
      "Supprimer définitivement les {{ count }} répertoires de Récemment supprimés ? Cette action est irréversible. Les répertoires restent réservés à votre compte, personne d'autre ne pourra les réclamer.",
    alias_stats_title: "Statistiques",
    alias_stats_received: "{{ count }} reçu(s)",
    alias_stats_forwarded: "{{ count }} transféré(s)",
    alias_stats_blocked: "{{ count }} bloqué(s)",
    alias_stats_replied: "{{ count }} répondu(s)",
    alias_stats_created: "Créé le {{ date }}",
    alias_generate_random: "Générer un alias aléatoire",
    alias_pin: "Épingler l'alias",
    alias_unpin: "Désépingler l'alias",
    alias_pinned_toast: "Alias épinglé",
    alias_unpinned_toast: "Alias désépinglé",
    alias_advanced: "Avancé",
    alias_advanced_hide: "Masquer les options avancées",
    alias_advanced_show: "Paramètres avancés",
    alias_details_title: "Détails",
    alias_display_name_label: "Nom affiché",
    alias_note_label: "Note",
    alias_details_description: "Nommez cet alias et notez où vous l'utilisez.",
    alias_display_name_desc:
      "Affiché comme nom d'expéditeur lorsque vous écrivez depuis cet alias.",
    alias_note_desc: "Un rappel privé de l'usage de cet alias.",
    alias_websites_desc:
      "Sites sur lesquels vous vous êtes inscrit avec cet alias.",
    alias_stats_description: "Le volume de courrier traité par cet alias.",
    alias_usage_used_of: "{{ used }} alias sur {{ max }} utilisés",
    alias_usage_unlock: "Passer en illimité",
    alias_usage_nudge:
      "Les offres payantes incluent des alias illimités, des domaines personnalisés, des règles d'alias et l'épinglage d'expéditeurs.",
    alias_sender_pin_mode_label: "Mode",
    alias_feature_locked_stats:
      "Passez à une offre supérieure pour voir l'activité de cet alias.",
    alias_feature_locked_delivery_log:
      "Passez à une offre supérieure pour voir ce qui a été bloqué.",
    alias_paid_badge: "Payant",
    alias_field_display_name_label: "Nom d'affichage",
    alias_field_note_label: "Note",
    alias_field_websites_label: "Sites web",
    alias_sender_pinning_title: "Épinglage d'expéditeur",
    alias_sender_pinning_info:
      "Décidez qui peut envoyer des e-mails à cet alias. Désactivé signifie que tout le monde peut passer. Verrouiller au premier expéditeur le restreint à la première personne qui vous écrit - utile pour les inscriptions ponctuelles. Liste d'autorisation signifie que seules les personnes que vous avez ajoutées peuvent vous joindre.",
    alias_sender_pinning_description:
      "Contrôlez quels expéditeurs peuvent joindre cet alias.",
    alias_sender_pin_mode_off: "Désactivé",
    alias_sender_pin_mode_off_hint: "Accepter les e-mails de tout le monde.",
    alias_sender_pin_mode_lock_first: "Verrouiller au premier expéditeur",
    alias_sender_pin_mode_lock_first_hint:
      "Seul le premier expéditeur qui écrit à cet alias est accepté par la suite.",
    alias_sender_pin_mode_allowlist: "Liste d'autorisation",
    alias_sender_pin_mode_allowlist_hint:
      "Seuls les expéditeurs que vous ajoutez ci-dessous sont acceptés.",
    alias_sender_add: "Ajouter un expéditeur",
    alias_sender_email_placeholder: "expediteur@exemple.com",
    alias_sender_list_empty: "Aucun expéditeur épinglé pour le moment.",
    alias_sender_unknown: "Expéditeur épinglé",
    alias_sender_added: "Expéditeur ajouté",
    alias_sender_removed: "Expéditeur retiré",
    alias_sender_add_failed: "Cet expéditeur n'a pas été ajouté. Réessayez.",
    alias_sender_invalid: "Saisissez une adresse e-mail valide.",
    alias_pin_mode_updated: "Épinglage d'expéditeur mis à jour",
    alias_toggle_failed:
      "Impossible de mettre à jour l'alias. Veuillez réessayer.",
    alias_enabled_toast: "Alias activé",
    alias_disabled_toast: "Alias désactivé",
    alias_delete_failed: "Impossible de supprimer l'alias. Veuillez réessayer.",
    domain_address_delete_failed:
      "Impossible de supprimer l'adresse. Veuillez réessayer.",
    domain_delete_failed:
      "Impossible de supprimer le domaine. Veuillez réessayer.",
    aliases_load_failed: "Impossible de charger vos alias. Veuillez réessayer.",
    alias_rules_title: "Règles",
    alias_rules_info:
      "Traitez automatiquement les e-mails avant qu'ils n'atteignent votre boîte de réception. Bloquez les e-mails d'un expéditeur, mettez-les à la corbeille ou étiquetez-les - le tout selon qui les a envoyés ou ce que dit l'objet.",
    alias_rules_description:
      "Exécutez des actions sur les e-mails entrants qui correspondent à vos conditions.",
    alias_rules_empty: "Aucune règle pour le moment.",
    alias_rule_add: "Ajouter une règle",
    alias_rule_save: "Enregistrer la règle",
    alias_rule_added: "Règle ajoutée",
    alias_rule_removed: "Règle supprimée",
    alias_rule_updated: "Règle mise à jour",
    alias_rule_save_failed: "Cette règle n'a pas été enregistrée. Réessayez.",
    alias_rule_when: "Quand",
    alias_rule_then: "Alors",
    alias_rule_add_condition: "Ajouter une condition",
    alias_rule_field_all: "N'importe quel champ",
    alias_rule_field_from: "De",
    alias_rule_field_to: "À",
    alias_rule_field_subject: "Objet",
    alias_rule_op_contains: "contient",
    alias_rule_op_equals: "est égal à",
    alias_rule_op_starts_with: "commence par",
    alias_rule_op_ends_with: "se termine par",
    alias_rule_op_matches_regex: "correspond à la regex",
    alias_rule_value_placeholder: "valeur",
    alias_rule_action_block: "Bloquer",
    alias_rule_action_to_trash: "Mettre à la corbeille",
    alias_rule_action_label: "Appliquer une étiquette",
    alias_rule_action_banner: "Afficher une bannière",
    alias_rule_action_subject_mask: "Masquer l'objet",
    alias_rule_action_auto_reply: "Réponse automatique",
    alias_rule_action_label_placeholder: "étiquette",
    alias_rule_action_banner_placeholder: "texte de la bannière",
    alias_rule_action_subject_mask_placeholder: "objet de remplacement",
    alias_rule_action_auto_reply_placeholder: "message de réponse automatique",
    alias_rule_needs_action: "Choisissez au moins une action.",
    alias_contacts_title: "Contacts inversés",
    alias_contacts_info:
      "Ajoutez quelqu'un ici si vous souhaitez lui écrire depuis cet alias. Il verra votre alias comme expéditeur, gardant votre véritable adresse privée. Vous pouvez bloquer des contacts individuels sans toucher aux autres.",
    alias_contacts_description:
      "Suivez les expéditeurs derrière un alias inversé par contact et bloquez-les individuellement.",
    alias_contacts_empty: "Aucun contact pour le moment.",
    alias_contact_add: "Ajouter un contact",
    alias_contact_email_placeholder: "contact@exemple.com",
    alias_contact_unknown: "Contact",
    alias_contact_added: "Contact ajouté",
    alias_contact_removed: "Contact supprimé",
    alias_contact_add_failed: "Ce contact n'a pas été ajouté. Réessayez.",
    alias_contact_block: "Bloquer",
    alias_contact_unblock: "Débloquer",
    alias_contact_blocked: "Bloqué",
    alias_delivery_log_title: "Journal des e-mails bloqués",
    alias_delivery_log_info:
      "E-mails bloqués avant d'atteindre votre boîte de réception. Journal conservé 30 jours.",
    alias_delivery_log_empty:
      "Aucun e-mail bloqué au cours des 30 derniers jours.",
    alias_delivery_log_reason_sender_pin: "Bloqué par le filtre d'expéditeur",
    alias_delivery_log_reason_alias_rule: "Rejeté par une règle",
    alias_delivery_log_reason_alias_disabled: "L'alias était désactivé",
    alias_delivery_log_reason_unknown: "Bloqué",
    alias_delivery_title: "Distribution",
    alias_delivery_folder: "Remettre dans",
    alias_delivery_folder_desc:
      "Choisis où arrive le courrier de cet alias. La boîte de réception est la valeur par défaut.",
    alias_delivery_folder_info:
      "Le courrier de cet alias va directement dans le dossier choisi, sans règle. Une règle correspondante reste prioritaire.",
    alias_delivery_folder_error:
      "Ce réglage n'a pas été enregistré. Un nouvel essai devrait suffire.",
    alias_delivery_folder_missing: "Dossier supprimé",
    alias_delivery_label: "Étiquette",
    alias_delivery_label_desc:
      "Appliquer une étiquette à chaque message reçu sur cet alias.",
    alias_delivery_label_info:
      "Les messages envoyés à cet alias sont étiquetés automatiquement, sans règle. L'étiquette s'ajoute au dossier de destination.",
    alias_delivery_label_none: "Aucune étiquette",
    alias_delivery_label_missing: "Étiquette supprimée",
    alias_apply_existing: "Appliquer aux e-mails existants",
    alias_apply_existing_desc:
      "Classez les e-mails déjà reçus par cet alias dans le dossier et l'étiquette que vous avez choisis.",
    alias_apply_existing_info:
      "Cette action applique le dossier de distribution et l'étiquette ci-dessus aux e-mails déjà présents dans votre compte. Elle s'exécute en arrière-plan, et vos règles de messagerie ne sont pas réexécutées.",
    alias_apply_existing_action: "Appliquer",
    alias_apply_existing_cancel: "Arrêter",
    alias_apply_existing_started:
      "Application de vos paramètres de distribution aux e-mails existants. L'opération s'exécute en arrière-plan.",
    alias_apply_existing_failed:
      "Impossible de lancer l'application de ces paramètres.",
    alias_apply_existing_cancel_failed: "Impossible d'arrêter cette opération.",
    alias_apply_existing_queued: "En file d'attente...",
    alias_apply_existing_progress:
      "Application : {{scanned}} analysés, {{applied}} mis à jour",
    alias_apply_existing_progress_total:
      "Application : {{scanned}} sur {{total}} analysés, {{applied}} mis à jour",
    alias_apply_existing_done:
      "Terminé : {{scanned}} analysés, {{applied}} mis à jour",
    alias_apply_existing_canceled: "Arrêté : {{applied}} mis à jour",
    alias_apply_existing_error:
      "L'application aux e-mails existants a échoué. Réessayez.",
    alias_apply_existing_unavailable:
      "Les e-mails déjà présents dans votre compte ne peuvent pas être déplacés vers Spam.",
    alias_delivery_label_error: "Ce réglage n'a pas été enregistré. Réessayez.",
    alias_delivery_rule_note:
      'La règle "{{ rule }}" déplace déjà les messages de cet alias vers {{ target }}.',
    alias_delivery_rule_conflict:
      'La règle "{{ rule }}" déplace les messages de cet alias vers {{ rule_target }}, ils n\'arriveront donc pas dans {{ target }}.',
    alias_delivery_label_rule_note:
      'La règle "{{ rule }}" étiquette déjà les messages de cet alias avec {{ target }}.',
    alias_delivery_label_rule_conflict:
      'La règle "{{ rule }}" étiquette les messages de cet alias avec {{ rule_target }}, pas {{ target }}.',
    alias_relay_title: "Distribution",
    alias_relay_description:
      "Choisissez comment les e-mails adressés à cet alias sont distribués.",
    alias_relay_mode_native: "Natif",
    alias_relay_mode_native_hint:
      "Les e-mails restent dans votre boîte aux lettres Aster chiffrée.",
    alias_relay_mode_relay: "Relais",
    alias_relay_mode_relay_hint:
      "Rediriger les e-mails vers une adresse externe que vous contrôlez.",
    alias_relay_not_private_warning:
      "Le relais vers une adresse externe N'EST PAS privé de bout en bout. Le fournisseur de destination peut lire les e-mails redirigés.",
    alias_relay_destinations_title: "Rediriger vers",
    alias_relay_destination_empty: "Aucune destination pour le moment.",
    alias_relay_destination_unknown: "Destination",
    alias_relay_destination_placeholder: "vous@externe.com",
    alias_relay_destination_add: "Ajouter une destination",
    alias_relay_destination_added: "Destination ajoutée",
    alias_relay_destination_removed: "Destination supprimée",
    alias_relay_destination_add_failed:
      "Cette destination n'a pas été ajoutée. Réessayez.",
    alias_relay_pgp_key: "Clé publique PGP (facultative)",
    alias_relay_pgp_key_placeholder: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
    alias_relay_strip_trackers: "Supprimer les traceurs",
    alias_relay_keep_copy: "Conserver une copie dans cette boîte aux lettres",
    alias_relay_mode_updated: "Mode de distribution mis à jour",
    alias_directories_title: "Répertoires",
    alias_directories_info:
      "Choisissez un mot-clé et les e-mails adressés à n'importe quoi.motclé@astermail.org créeront automatiquement un nouvel alias sur-le-champ - aucune application nécessaire. Idéal pour s'inscrire à des services sans avoir à inventer une nouvelle adresse à chaque fois.",
    alias_directories_description:
      "Les e-mails adressés à n'importe quoi.<clé>@astermail.org créent automatiquement un alias pour vous.",
    alias_directories_empty: "Aucun répertoire pour le moment.",
    alias_directory_key_label: "Clé de répertoire",
    alias_directory_key_placeholder: "achats",
    alias_directory_create: "Créer un répertoire",
    alias_directory_created: "Répertoire créé",
    alias_directory_available: "Ce répertoire est disponible.",
    alias_directory_not_available: "Ce répertoire est déjà pris.",
    alias_directory_removed: "Répertoire supprimé",
    alias_directory_separator_hint:
      "Un point, une barre oblique, un signe plus ou un dièse fonctionnent avant le nom du répertoire.",
    alias_bulk_enabled: "Les alias sélectionnés sont activés.",
    alias_bulk_disabled: "Les alias sélectionnés sont désactivés.",
    alias_bulk_update_partial_failed:
      "{{count}} alias sur {{total}} n'ont pas été mis à jour.",
    alias_bulk_delete_partial_failed:
      "{{count}} alias sur {{total}} n'ont pas été supprimés. Vous pouvez supprimer un alias 30 jours après sa création.",
    alias_directory_create_failed: "Ce répertoire n'a pas été créé. Réessayez.",
    alias_directory_auto_create: "Créer automatiquement des alias",
    alias_directory_pattern_hint:
      "Envoyez à n'importe quoi.{{ key }}@{{ domain }} pour générer un nouvel alias.",
    alias_directory_color: "Couleur",
    alias_directory_updated: "Répertoire mis à jour",
    alias_feature_locked_directories:
      "Améliorez votre forfait pour utiliser les répertoires d'alias.",
    alias_feature_locked_rules:
      "Améliorez votre forfait pour utiliser les règles d'alias.",
    alias_feature_locked_relay:
      "Améliorez votre forfait pour utiliser le relais externe.",
    alias_feature_locked_contacts:
      "Améliorez votre forfait pour utiliser les contacts à alias inversé.",
    alias_feature_locked_sender_pinning:
      "Améliorez votre forfait pour utiliser l'épinglage d'expéditeur.",
    requires_plan: "Nécessite {{plan}}",
    alias_domain_group_extra: "Domaines supplémentaires",
    alias_domain_requires_plan: "Ce domaine est disponible à partir du forfait {{plan}}.",
    alias_feature_locked_view_plans: "Voir les forfaits",
    alias_feature_locked_upgrade_plan: "Améliorer le forfait",
    alias_feature_locked_upgrade_cta: "Améliorer",
    feature_requires_upgrade:
      "Cette fonctionnalité nécessite un abonnement supérieur.",
    alias_rule_cancel: "Annuler",
    alias_rule_close: "Fermer le générateur de règles",
    alias_rule_field_label: "Champ",
    alias_rule_operator_label: "Condition",
    alias_rule_value_label: "Valeur",
    alias_rule_new_title: "Nouvelle règle",
    alias_rule_edit_title: "Modifier la règle",
    alias_rule_save_changes: "Enregistrer les modifications",
    alias_rule_needs_condition: "Ajoutez au moins une condition.",
    alias_rule_match_all_emails: "Correspondre à tous les e-mails",
    alias_tab_aliases: "Alias",
    alias_tab_domains: "Domaines",
    alias_tab_directories: "Répertoires",
    alias_tab_ghost: "Alias éphémères",
    alias_tab_preferences: "Préférences",
    alias_search_placeholder: "Rechercher des alias...",
    alias_filter_all: "Tous",
    alias_filter_enabled: "Activés",
    alias_filter_disabled: "Désactivés",
    alias_bulk_edit: "Modification groupée",
    alias_bulk_selected: "{{count}} sélectionné(s)",
    alias_bulk_enable: "Activer",
    alias_bulk_disable: "Désactiver",
    alias_bulk_delete: "Supprimer",
    alias_bulk_select_all: "Tout sélectionner",
    alias_format_words: "Mots",
    alias_format_uuid: "UUID",
    alias_directory_separator: "Séparateur",
    alias_export_csv: "Exporter en CSV",
    alias_export_title: "Exporter les alias",
    alias_export_description:
      "Choisissez ce qu'il faut inclure. Le fichier est généré dans votre navigateur et n'est jamais envoyé à nos serveurs.",
    alias_export_format_csv: "CSV (tableur)",
    alias_export_format_json: "JSON",
    alias_export_confirm_description: "Vérifiez ce que vous allez télécharger.",
    alias_export_source_aliases: "Alias",
    alias_export_source_domain_addresses: "Adresses de domaine personnalisé",
    alias_export_source_directories: "Répertoires",
    alias_export_source_ghost: "Alias fantômes",
    alias_export_source_count: "{{count}} entrées",
    alias_export_choose_columns:
      "Choisir les colonnes ({{count}} sélectionnées)",
    alias_export_hide_columns: "Masquer les colonnes",
    alias_export_format_label: "Format de fichier",
    alias_export_column_address: "Adresse",
    alias_export_column_display_name: "Nom affiché",
    alias_export_column_note: "Note",
    alias_export_column_websites: "Sites web",
    alias_export_column_enabled: "Activé",
    alias_export_column_created_at: "Créé le",
    alias_export_column_directory: "Répertoire",
    alias_export_column_domain: "Domaine",
    alias_export_column_auto_create: "Création automatique",
    alias_export_column_color: "Couleur",
    alias_export_column_expires_at: "Expire le",
    alias_export_warning_title: "Ce fichier n'est pas chiffré",
    alias_export_warning_body:
      "Toute personne qui l'ouvre peut lire chaque alias, note et site web qu'il contient. Conservez-le dans votre gestionnaire de mots de passe ou sur un disque chiffré.",
    alias_export_summary: "{{count}} entrées réparties sur {{files}}.",
    alias_export_download: "Télécharger",
    alias_export_incomplete:
      "Seuls {{loaded}} alias sur {{total}} ont été chargés. Rechargez vos alias et réessayez pour que la sauvegarde soit complète.",
    alias_export_undecryptable:
      "{{count}} alias n'ont pas pu être déchiffrés et ne sont pas inclus.",
    alias_export_undecryptable_ghost:
      "{{count}} alias fantômes n'ont pas pu être déchiffrés et ne sont pas inclus.",
    alias_export_load_failed:
      "Impossible de charger les répertoires ou les alias fantômes.",
    alias_export_failed: "Échec de l'exportation. Rien n'a été téléchargé.",
    alias_import_csv: "Importer des alias",
    alias_import_progress: "Importation de {{current}} sur {{total}}...",
    alias_import_done: "{{created}} alias importés.",
    alias_import_skipped: "{{skipped}} ignoré(s) (domaine non pris en charge).",
    alias_import_title: "Importer des alias",
    alias_import_drop_hint:
      "Déposez ici un CSV, une liste texte ou un export JSON, ou choisissez un fichier",
    alias_import_choose_file: "Choisir un fichier",
    alias_import_preview_title: "Aperçu",
    alias_import_will_import: "Sera importé",
    alias_import_already_exists: "Existe déjà",
    alias_import_unsupported_domain: "Domaine non pris en charge",
    alias_import_skip_existing: "Ignorer les existants",
    alias_import_update_existing: "Réactiver si désactivé",
    alias_import_confirm: "Importer {{count}} alias",
    alias_import_summary_created: "{{count}} importés",
    alias_import_summary_skipped: "{{count}} existaient déjà",
    alias_import_summary_failed: "{{count}} en échec",
    alias_import_error_no_aliases:
      "Aucun alias importable trouvé dans ce fichier.",
    alias_import_protonpass_encrypted_error:
      "Cet export Proton Pass est chiffré. Utilisez « Exporter sans chiffrement » dans Proton Pass, puis réimportez.",
    alias_import_target_domain: "Importer vers",
    alias_import_invalid: "Non valide",
    alias_import_col_address: "Adresse",
    alias_import_col_status: "Statut",
    alias_pref_section: "Préférences",
    alias_pref_default_domain: "Domaine par défaut",
    alias_pref_default_domain_desc:
      "Domaine utilisé lors de la création de nouveaux alias.",
    alias_pref_sender_format: "Format d'affichage de l'expéditeur",
    alias_pref_sender_format_desc:
      "Comment les noms d'expéditeur apparaissent lorsque les e-mails sont redirigés vers votre alias.",
    alias_pref_sender_via: "Nom via e-mail",
    alias_pref_sender_at: "Nom - e-mail at domaine",
    alias_pref_readable_reverse: "Inclure l'expéditeur dans les alias inversés",
    alias_pref_readable_reverse_desc:
      "Les nouveaux alias inversés utiliseront l'adresse de l'expéditeur afin que vous puissiez voir d'un coup d'œil qui vous écrit.",
    alias_pref_always_expand: "Toujours afficher les détails de l'alias",
    alias_pref_always_expand_desc:
      "Affiche le panneau complet des paramètres de l'alias par défaut au lieu de le masquer derrière l'icône d'engrenage.",
    alias_pref_unsubscribe_action: "Action du bouton de désabonnement",
    alias_pref_unsubscribe_action_desc:
      "Ce qui se passe lorsque vous cliquez sur le bouton de désabonnement d'un e-mail redirigé.",
    alias_pref_unsubscribe_preserve: "Utiliser la politique d'origine",
    alias_pref_unsubscribe_disable_alias: "Désactiver l'alias",
    alias_pref_unsubscribe_block_contact: "Bloquer l'expéditeur",
    alias_pref_disabled_response: "Réponse aux e-mails bloqués",
    alias_pref_disabled_response_desc:
      "Ce que voit l'expéditeur lorsque son e-mail est rejeté silencieusement.",
    alias_pref_disabled_ignore: "Ignorer silencieusement",
    alias_pref_disabled_reject: "Rejeter (renvoyer)",
    alias_pref_delete_action: "Lors de la suppression d'un alias",
    alias_pref_delete_action_desc:
      "Choisissez si les alias supprimés vont à la corbeille (récupérables pendant 30 jours) ou sont supprimés immédiatement.",
    alias_pref_sender_format_info:
      "Comment le nom de l'expéditeur apparaît dans les e-mails redirigés.",
    alias_pref_readable_reverse_info:
      "Lorsque cette option est activée, les adresses d'alias inversé incluent l'e-mail de l'expéditeur pour identifier l'auteur d'un coup d'œil.",
    alias_pref_always_expand_info:
      "Affiche automatiquement le panneau de réglages complet de chaque alias au lieu de le masquer derrière l'icône d'engrenage.",
    alias_pref_unsubscribe_action_info:
      "Ce qui se passe lorsque vous cliquez sur le bouton de désabonnement dans un e-mail redirigé.",
    alias_pref_disabled_response_info:
      "Ce que voit l'expéditeur lorsqu'il écrit à un alias désactivé ou à un contact bloqué.",
    alias_pref_delete_action_info:
      "Mettre à la corbeille garde les alias supprimés récupérables pendant 30 jours. Supprimer immédiatement les retire définitivement.",
    alias_pref_delete_trash: "Mettre à la corbeille",
    alias_pref_delete_immediate: "Supprimer immédiatement",
    alias_activity_title: "Activité (14 derniers jours)",
    alias_activity_received: "{{count}} reçu(s)",
    alias_activity_forwarded: "{{count}} transféré(s)",
    alias_activity_blocked: "{{count}} bloqué(s)",
    alias_activity_empty: "Aucune activité pour l'instant",
    alias_transfer: "Transférer l'alias",
    alias_transfer_title: "Transférer l'alias",
    alias_transfer_warning:
      "Une fois transféré, vous n'aurez plus accès à cet alias.",
    alias_transfer_recipient_label: "E-mail du destinataire",
    alias_transfer_recipient_placeholder: "utilisateur@astermail.org",
    alias_transfer_confirm: "Transférer",
    alias_transfer_success: "Alias transféré avec succès.",
    low_network_mode_section_title: "Performances",
    low_network_mode_label: "Mode réseau réduit",
    low_network_mode_description:
      "Ignore les photos de profil, les favicons, les images externes et le préchargement des e-mails. Tous les e-mails sont affichés en texte brut. Utile sur les connexions lentes ou limitées.",
    low_network_mode_active_banner: "Mode réseau réduit actif",
    info_low_network_mode_title: "Que fait le mode réseau réduit ?",
    info_low_network_mode_description:
      "Bloque toutes les requêtes réseau non essentielles pour garder Aster utilisable sur les connexions lentes ou limitées. Désactive les photos de profil, les logos d'expéditeur, les favicons de domaine, les images externes dans les e-mails, le préchargement des e-mails, les polices personnalisées, les aperçus de pièces jointes et les sons de notification. Tous les e-mails sont affichés en texte brut. Les fils de discussion sont limités à 4 messages. S'active automatiquement sur les connexions 2G ou Économiseur de données. Vous pouvez aussi l'activer via ?low_bandwidth=1 dans l'URL.",
    fam_org_tab_overview: "Aperçu",
    fam_org_tab_members: "Membres",
    fam_org_tab_groups: "Groupes",
    fam_org_tab_activity: "Activité",
    fam_org_tab_filters: "Filtres",
    fam_org_tab_domains: "Domaines",
    fam_org_tab_security: "Sécurité",
    fam_org_tab_retention: "Conservation des données",
    fam_org_groups_name_placeholder: "Nom du groupe",
    fam_org_groups_prefix_placeholder: "Préfixe d'e-mail (facultatif)",
    fam_org_groups_domain_placeholder: "Sélectionner un domaine",
    fam_org_groups_create: "Créer",
    fam_org_groups_info_title: "Groupes de l'organisation",
    fam_org_groups_info_desc:
      "Un groupe rassemble plusieurs membres sous une seule adresse partagée. Le courrier envoyé à l'adresse du groupe est distribué à chacun de ses membres - pratique pour les boîtes partagées comme family@ ou parents@. Le préfixe d'e-mail est facultatif.",
    fam_org_groups_prefix_hint:
      "Le préfixe d'e-mail est facultatif - il crée une adresse de groupe comme",
    fam_org_groups_address_preview: "Adresse du groupe : ",
    fam_org_groups_address_in_use:
      "Cette adresse est déjà utilisée par un alias ou un autre groupe",
    fam_org_groups_empty_title: "Aucun groupe pour l'instant",
    fam_org_groups_empty_desc:
      "Créez un groupe pour acheminer le courrier vers plusieurs membres de la famille à la fois.",
    fam_org_groups_has_email_title: "Possède une adresse e-mail",
    fam_org_member_groups_empty_title: "Aucun groupe pour l'instant",
    fam_org_member_groups_empty_desc:
      "Vous n'avez encore été ajouté à aucun groupe.",
    fam_org_groups_default_domain: "@your-domain.com",
    fam_org_groups_delete: "Supprimer le groupe",
    fam_org_groups_no_members: "Aucun membre.",
    fam_org_groups_add_someone: "Ajouter quelqu'un",
    fam_org_groups_remove: "Retirer",
    fam_org_groups_remove_from_group: "Retirer du groupe",
    fam_org_groups_select_member: "Sélectionner un membre...",
    fam_org_groups_add: "Ajouter",
    fam_org_groups_cancel: "Annuler",
    fam_org_groups_add_member: "Ajouter un membre",
    fam_org_groups_delete_title: "Supprimer le groupe ?",
    fam_org_groups_delete_body:
      "Cette action supprimera définitivement ce groupe et en retirera tous les membres. Elle est irréversible.",
    fam_org_groups_delete_confirm: "Supprimer le groupe",
    fam_org_groups_created: "Groupe créé",
    fam_org_groups_deleted: "Groupe supprimé",
    fam_org_groups_member_added: "Membre ajouté",
    fam_org_groups_member_removed: "Membre retiré",
    fam_org_groups_load_failed: "Échec du chargement des groupes",
    fam_org_groups_members_load_failed: "Échec du chargement des membres",
    fam_org_groups_create_failed: "Échec de la création du groupe",
    fam_org_groups_delete_failed: "Échec de la suppression du groupe",
    fam_org_groups_remove_failed: "Échec du retrait du membre",
    fam_org_groups_add_failed: "Échec de l'ajout du membre",
    fam_org_groups_search_placeholder: "Rechercher des membres...",
    fam_org_groups_no_available: "Aucun membre disponible à ajouter",
    fam_org_event_member_joined: "Membre ajouté",
    fam_org_event_member_removed: "Membre retiré",
    fam_org_event_member_left: "Membre parti",
    fam_org_event_admin_transferred: "Administration transférée",
    fam_org_event_group_created: "Groupe créé",
    fam_org_event_group_deleted: "Groupe supprimé",
    fam_org_event_filter_created: "Filtre créé",
    fam_org_event_domain_shared: "Domaine partagé",
    fam_org_event_retention_updated: "Conservation mise à jour",
    fam_org_event_security_policy_updated: "Sécurité mise à jour",
    fam_org_event_invite_sent: "Invitation envoyée",
    fam_org_event_invite_revoked: "Invitation révoquée",
    fam_org_event_storage_updated: "Stockage mis à jour",
    fam_org_event_security_notify_sent: "Rappel 2FA envoyé",
    fam_org_activity_someone: "Quelqu'un",
    fam_org_activity_member_joined: "{{target}} a rejoint la famille",
    fam_org_activity_member_joined_generic: "Un membre a rejoint",
    fam_org_activity_member_removed: "{{actor}} a retiré {{target}}",
    fam_org_activity_member_removed_generic: "{{actor}} a retiré un membre",
    fam_org_activity_member_left: "{{target}} a quitté la famille",
    fam_org_activity_member_left_generic: "Un membre est parti",
    fam_org_activity_admin_transferred:
      "{{actor}} a transféré l'administration à {{target}}",
    fam_org_activity_admin_transferred_generic:
      "{{actor}} a transféré l'administration",
    fam_org_activity_group_created: "{{actor}} a créé un groupe",
    fam_org_activity_group_deleted: "{{actor}} a supprimé un groupe",
    fam_org_activity_filter_created: "{{actor}} a créé un filtre",
    fam_org_activity_domain_shared:
      "{{actor}} a partagé un domaine avec {{target}}",
    fam_org_activity_domain_shared_generic: "{{actor}} a partagé un domaine",
    fam_org_activity_retention_updated:
      "{{actor}} a mis à jour la politique de conservation",
    fam_org_activity_security_policy_updated:
      "{{actor}} a mis à jour la politique de sécurité",
    fam_org_activity_security_notify_sent:
      "{{actor}} a envoyé un rappel 2FA aux membres",
    fam_org_activity_invite_sent: "{{actor}} a invité {{target}}",
    fam_org_activity_invite_sent_generic: "{{actor}} a envoyé une invitation",
    fam_org_activity_invite_revoked:
      "{{actor}} a révoqué l'invitation de {{target}}",
    fam_org_activity_invite_revoked_generic:
      "{{actor}} a révoqué une invitation",
    fam_org_activity_storage_updated:
      "{{actor}} a mis à jour le stockage de {{target}}",
    fam_org_activity_storage_updated_generic:
      "{{actor}} a mis à jour le stockage",
    fam_org_activity_events: "{{count}} événements",
    fam_org_activity_events_plural: "{{count}} événements",
    fam_org_activity_search_placeholder: "Rechercher une activité...",
    fam_org_activity_all_events: "Tous les événements",
    fam_org_activity_empty_title: "Aucune activité pour l'instant",
    fam_org_activity_empty_desc:
      "Les arrivées de membres, les changements de sécurité et les actions administratives apparaîtront ici.",
    fam_org_activity_cat_member_joins: "Arrivées de membres",
    fam_org_activity_cat_security_changes: "Changements de sécurité",
    fam_org_activity_cat_filter_updates: "Mises à jour de filtres",
    fam_org_activity_cat_domain_sharing: "Partage de domaines",
    fam_org_activity_cat_storage_changes: "Changements de stockage",
    fam_org_activity_cat_invite_activity: "Activité des invitations",
    fam_org_activity_load_more: "Charger plus",
    fam_org_activity_load_failed: "Échec du chargement de l'activité",
    fam_org_filter_field_from: "Expéditeur",
    fam_org_filter_field_to: "Destinataire",
    fam_org_filter_field_domain: "Domaine",
    fam_org_filter_field_subject: "Objet",
    fam_org_filter_field_ip: "IP de l'expéditeur",
    fam_org_filter_action_trash: "Déplacer vers la corbeille",
    fam_org_filter_action_block: "Bloquer",
    fam_org_filter_action_archive: "Archiver",
    fam_org_filter_action_tag: "Étiqueter",
    fam_org_filter_action_redirect: "Rediriger",
    fam_org_filter_disable: "Désactiver le filtre",
    fam_org_filter_enable: "Activer le filtre",
    fam_org_filter_delete: "Supprimer le filtre",
    fam_org_filters_heading: "Filtres de l'organisation",
    fam_org_filters_info_title: "Filtres de l'organisation",
    fam_org_filters_info_desc:
      "Des règles qui s'exécutent automatiquement sur le courrier entrant de chaque membre de la famille. Utilisez-les pour bloquer des expéditeurs, archiver, étiqueter ou rediriger des messages sur tous les comptes en une seule fois.",
    fam_org_filters_new: "Nouveau filtre",
    fam_org_filters_subtitle:
      "Les filtres s'appliquent aux boîtes de réception de tous les membres de la famille à l'échelle de l'organisation.",
    fam_org_filters_modal_title: "Nouveau filtre d'organisation",
    fam_org_filters_modal_desc:
      "S'applique automatiquement aux boîtes de réception de tous les membres de la famille.",
    fam_org_filters_name_label: "Nom du filtre",
    fam_org_filters_name_placeholder: "ex. Bloquer un domaine indésirable",
    fam_org_filters_condition_label: "Condition",
    fam_org_filters_condition_info_title: "Condition",
    fam_org_filters_condition_info_desc:
      "Choisissez quelle partie d'un e-mail entrant comparer (expéditeur, destinataire, objet, domaine ou IP de l'expéditeur) et la valeur à rechercher. Le courrier correspondant déclenche l'action ci-dessous.",
    fam_org_filters_field_from_option: "Expéditeur (de)",
    fam_org_filters_field_to_option: "Destinataire (à)",
    fam_org_filters_field_domain_option: "Domaine",
    fam_org_filters_field_subject_option: "Objet",
    fam_org_filters_field_ip_option: "IP de l'expéditeur",
    fam_org_filters_value_placeholder: "valeur, domaine, mot-clé...",
    fam_org_filters_action_label: "Action",
    fam_org_filters_action_info_title: "Action",
    fam_org_filters_action_info_desc:
      "Que faire du courrier qui correspond à la condition : le déplacer vers la corbeille, bloquer l'expéditeur, l'archiver, l'étiqueter ou le rediriger vers une autre adresse.",
    fam_org_filters_action_trash_option: "Déplacer vers la corbeille",
    fam_org_filters_action_block_option: "Bloquer l'expéditeur",
    fam_org_filters_action_archive_option: "Archiver",
    fam_org_filters_action_tag_option: "Étiqueter",
    fam_org_filters_action_redirect_option: "Rediriger",
    fam_org_filters_cancel: "Annuler",
    fam_org_filters_create: "Créer le filtre",
    fam_org_filters_empty_title: "Aucun filtre d'organisation",
    fam_org_filters_empty_desc:
      "Créez des filtres pour appliquer des règles à toutes les boîtes de réception des membres.",
    fam_org_filters_created: "Filtre créé",
    fam_org_filters_deleted: "Filtre supprimé",
    fam_org_filters_load_failed: "Échec du chargement des filtres",
    fam_org_filters_create_failed: "Échec de la création du filtre",
    fam_org_filters_update_failed: "Échec de la mise à jour du filtre",
    fam_org_filters_delete_failed: "Échec de la suppression du filtre",
    fam_org_domains_subtitle:
      "Partagez des domaines personnalisés pour que les membres de la famille puissent y créer des alias.",
    fam_org_domains_loading: "Chargement...",
    fam_org_domains_empty_title:
      "Aucun domaine personnalisé dans cette famille",
    fam_org_domains_empty_desc:
      "Les domaines personnalisés permettent aux membres de la famille d'envoyer depuis leurs propres adresses @yourdomain.com.",
    fam_org_domains_add_domain: "Ajouter un domaine",
    fam_org_domains_verified: "Vérifié",
    fam_org_domains_unverified: "Non vérifié",
    fam_org_domains_owned_by: "Détenu par {{name}}",
    fam_org_domains_share: "Partager",
    fam_org_domains_share_enabled_title: "Partager avec les membres",
    fam_org_domains_share_disabled_title:
      "Vérifiez d'abord DKIM pour activer le partage",
    fam_org_domains_add_member_placeholder: "Ajouter un membre...",
    fam_org_domains_add_btn: "Ajouter",
    fam_org_domains_done: "Terminé",
    fam_org_domains_shared_with: "Actuellement partagé avec",
    fam_org_domains_revoke: "Révoquer",
    fam_org_domains_shared: "Domaine partagé",
    fam_org_domains_revoked: "Partage de domaine révoqué",
    fam_org_domains_share_failed: "Échec du partage du domaine",
    fam_org_domains_revoke_failed:
      "Échec de la révocation du partage du domaine",
    fam_org_domains_load_failed: "Échec du chargement des domaines",
    fam_org_2fa_banner:
      "{{count}} membres n'ont pas activé l'authentification à deux facteurs",
    fam_org_2fa_banner_plural: "{{count}} membres n'ont pas activé la 2FA",
    fam_org_2fa_send_reminder: "Envoyer un rappel",
    fam_org_2fa_sending: "Envoi...",
    fam_org_2fa_reminder_sent: "Rappel envoyé",
    fam_org_2fa_reminder_sent_toast: "Rappel envoyé à {{count}} membres",
    fam_org_2fa_reminder_rate_limited:
      "Un rappel a déjà été envoyé récemment. Vous pourrez en envoyer un autre dans 24 heures.",
    fam_org_2fa_reminder_failed: "Échec de l'envoi du rappel",
    fam_org_2fa_dismiss: "Ignorer",
    fam_org_2fa_summary:
      "{{withCount}} membres sur {{total}} ont activé la 2FA",
    fam_org_sec_require_2fa: "Exiger l'authentification à deux facteurs",
    fam_org_sec_require_2fa_desc:
      "Tous les membres doivent activer la 2FA pour accéder à leur compte",
    fam_org_sec_require_2fa_info_title:
      "Exiger l'authentification à deux facteurs",
    fam_org_sec_require_2fa_info_desc:
      "Les membres seront invités à configurer l'authentification à deux facteurs et ne pourront pas accéder à leur boîte aux lettres tant qu'ils ne l'auront pas fait. Fortement recommandé pour chaque forfait Famille.",
    fam_org_sec_active: "Actif",
    fam_org_sec_grace: "Période de grâce pour les nouveaux membres",
    fam_org_sec_grace_desc:
      "Jours avant l'application de la 2FA après l'arrivée",
    fam_org_sec_grace_info_title: "Période de grâce pour les nouveaux membres",
    fam_org_sec_grace_info_desc:
      "Combien de jours un membre nouvellement arrivé peut utiliser son compte avant que la 2FA ne devienne obligatoire. Réglez sur 0 pour l'exiger immédiatement à l'arrivée.",
    fam_org_sec_days: "jours",
    fam_org_sec_max_sessions: "Sessions actives maximales par membre",
    fam_org_sec_max_sessions_desc:
      "Limitez les connexions simultanées sur les appareils. Laissez vide pour aucune limite.",
    fam_org_sec_max_sessions_info_title:
      "Sessions actives maximales par membre",
    fam_org_sec_max_sessions_info_desc:
      "Le nombre maximal d'appareils ou de navigateurs sur lesquels un membre peut être connecté à la fois. Lorsque la limite est dépassée, la session la plus ancienne est déconnectée.",
    fam_org_sec_no_limit: "Aucune limite",
    fam_org_sec_sessions: "sessions",
    fam_org_sec_auto_signout: "Déconnexion automatique après",
    fam_org_sec_auto_signout_desc:
      "Déconnecter les membres après N heures d'inactivité.",
    fam_org_sec_auto_signout_info_title: "Déconnexion automatique après",
    fam_org_sec_auto_signout_info_desc:
      "Déconnecte automatiquement les membres après ce nombre d'heures sans activité, les obligeant à se reconnecter. Laissez vide pour ne jamais expirer.",
    fam_org_sec_never: "Jamais",
    fam_org_sec_hours: "heures",
    fam_org_sec_saving: "Enregistrement...",
    fam_org_sec_loading: "Chargement...",
    fam_org_sec_compliance: "Conformité des membres",
    fam_org_sec_2fa_badge: "2FA",
    fam_org_sec_no_2fa_badge: "Pas de 2FA",
    fam_org_sec_imap_badge: "IMAP",
    fam_org_sec_session_count: "{{count}} sessions actives",
    fam_org_sec_session_count_plural: "{{count}} sessions actives",
    fam_org_sec_no_sessions: "Aucune session active",
    fam_org_sec_last_seen: "vu pour la dernière fois {{time}}",
    fam_org_sec_never_signed_in: "Jamais connecté",
    fam_org_sec_load_failed: "Échec du chargement des paramètres de sécurité",
    fam_org_sec_save_failed: "Échec de l'enregistrement",
    fam_org_ret_intro:
      'Définissez des limites pour supprimer automatiquement les anciens messages. Les modifications sont enregistrées automatiquement. Laissez vide pour conserver indéfiniment. S\'applique à tous les membres lorsque "Appliquer à tous les membres" est activé.',
    fam_org_ret_loading: "Chargement...",
    fam_org_ret_trash: "Corbeille",
    fam_org_ret_trash_hint:
      "Supprimer automatiquement le courrier de la corbeille",
    fam_org_ret_trash_info:
      "Les messages dans la corbeille plus anciens que ce nombre de jours sont définitivement supprimés.",
    fam_org_ret_spam: "Indésirables",
    fam_org_ret_spam_hint:
      "Supprimer automatiquement les indésirables (par défaut 30 jours)",
    fam_org_ret_spam_info:
      "Les messages dans les indésirables sont purgés après ce nombre de jours. La plupart des fournisseurs utilisent 30 par défaut.",
    fam_org_ret_sent: "Envoyés",
    fam_org_ret_sent_hint: "Supprimer automatiquement le courrier envoyé",
    fam_org_ret_sent_info:
      "Les messages dans Envoyés plus anciens que ce nombre de jours sont supprimés. Laissez vide pour conserver tout le courrier envoyé.",
    fam_org_ret_all_mail: "Tout le courrier",
    fam_org_ret_all_mail_hint: "Limite stricte sur tous les messages",
    fam_org_ret_all_mail_info:
      "Un plafond strict sur tous les dossiers. Tout message plus ancien que ce nombre de jours est supprimé, y compris la boîte de réception. À utiliser avec prudence.",
    fam_org_ret_off: "Désactivé",
    fam_org_ret_days: "jours",
    fam_org_ret_enforce: "Appliquer à tous les membres",
    fam_org_ret_enforce_info_title: "Appliquer à tous les membres",
    fam_org_ret_enforce_info_desc:
      "Lorsque cette option est activée, ces limites de conservation sont appliquées à chaque compte membre et les membres ne peuvent pas les modifier. Lorsqu'elle est désactivée, les limites ne s'appliquent qu'à votre propre compte.",
    fam_org_ret_enforce_on_desc:
      "Appliqué à tous les membres - ils ne peuvent pas le remplacer",
    fam_org_ret_enforce_off_desc:
      "Lorsqu'elle est activée, ces limites s'appliquent à tous les comptes membres. Les membres ne peuvent pas les remplacer.",
    fam_org_ret_saving: "Enregistrement...",
    fam_org_ret_confirm_title: "Appliquer la conservation à tous les membres ?",
    fam_org_ret_confirm_body:
      "Ces limites de conservation seront appliquées à chaque compte de cette famille. Les membres ne pourront pas les remplacer, et le courrier plus ancien que vos limites sera définitivement supprimé de leurs comptes. Cette action est irréversible pour les messages déjà supprimés.",
    fam_org_ret_confirm_cancel: "Annuler",
    fam_org_ret_confirm_action: "Appliquer à tous les membres",
    fam_org_ret_load_failed:
      "Échec du chargement des paramètres de conservation",
    fam_org_ret_save_failed: "Échec de l'enregistrement",
    controlled_by_family_admin: "Contrôlé par l'administrateur de la famille",
    fam_consent_title: "Consentement des membres requis",
    fam_consent_body:
      "Cette modification affecte les données de tous les membres de la famille. Une demande de consentement sera envoyée à {{count}} membre(s). La modification ne prendra effet qu'une fois que tous les membres auront accepté.",
    fam_consent_cancel: "Annuler",
    fam_consent_send: "Envoyer la demande de consentement",
    fam_consent_sent_toast:
      "Demande de consentement envoyée à tous les membres",
    fam_consent_send_failed: "Échec de l'envoi de la demande de consentement",
    fam_consent_member_title: "Demandes de consentement de l'administrateur",
    fam_consent_member_from: "Demandé par {{name}}",
    fam_consent_member_accept: "Accepter",
    fam_consent_member_decline: "Refuser",
    fam_consent_member_accepted_toast: "Modification acceptée",
    fam_consent_member_declined_toast: "Modification refusée",
    fam_ret_unsaved_consent:
      "Les modifications nécessitent le consentement des membres avant d'être enregistrées",
    fam_ret_request_consent: "Demander le consentement",
    fam_consent_retention_desc:
      "Mettre à jour la politique de conservation des données affectant tous les comptes membres",
    fam_consent_filter_create_desc:
      "Ajouter une règle de filtre à l'échelle de l'organisation à toutes les boîtes de réception des membres",
    fam_consent_filter_enable_desc:
      "Activer une règle de filtre à l'échelle de l'organisation pour toutes les boîtes de réception des membres",
    fam_consent_security_desc:
      "Mettre à jour la politique de sécurité affectant tous les comptes membres",
    fam_org_member_storage_updated: "Stockage mis à jour",
    fam_org_member_save: "Enregistrer",
    fam_org_member_cancel: "Annuler",
    fam_org_member_no_2fa: "Pas de 2FA",
    fam_org_member_last_seen: "Vu pour la dernière fois {{time}}",
    fam_org_member_pool_remaining: "{{count}} Go restants dans le pool",
    fam_org_time_never_seen: "Jamais vu",
    fam_org_time_just_now: "à l'instant",
    fam_org_time_minutes: "il y a {{count}} minutes",
    fam_org_time_hour: "il y a {{count}} heure",
    fam_org_time_hours: "il y a {{count}} heures",
    fam_org_time_yesterday: "Hier",
    fam_org_time_days: "il y a {{count}} jours",
    fam_org_time_month: "il y a {{count}} mois",
    fam_org_time_months: "il y a {{count}} mois",
    fam_org_time_year: "il y a {{count}} an",
    fam_org_time_years: "il y a {{count}} ans",
    fam_org_time_today: "aujourd'hui",
    fam_org_time_one_day_ago: "il y a 1 jour",
    fam_org_grace_banner:
      "Votre forfait Famille expire le {{date}} - renouvelez-le pour conserver l'accès",
    fam_org_grace_banner_expired:
      "Votre forfait Famille a expiré le {{date}} - renouvelez-le pour rétablir l'accès",
    fam_org_grace_banner_soon:
      "Votre forfait Famille expire bientôt - renouvelez-le pour conserver l'accès",
    fam_org_cancelled_banner:
      "Votre forfait Famille a été annulé - les membres perdront l'accès",
    fam_org_manage_billing: "Gérer la facturation",
    fam_org_heading: "Famille",
    fam_org_status_active: "Actif",
    fam_org_status_expiring: "Expire bientôt",
    fam_org_status_expired: "Expiré",
    fam_org_status_cancelled: "Annulé",
    fam_org_members_count:
      "{{used}} places sur {{max}} utilisées · {{count}} places disponibles",
    fam_org_members_count_plural:
      "{{used}} places sur {{max}} occupées · {{seats}} places disponibles",
    fam_seats_breakdown:
      "{{members}} membres, {{invites}} invitations, {{reserved}} adresses réservées",
    fam_org_setting_up: "Configuration de votre forfait Famille...",
    fam_org_refresh: "Actualiser",
    fam_org_checklist_title: "Démarrez avec votre forfait Famille",
    fam_org_checklist_subscribe: "Souscrire à un forfait Famille",
    fam_org_checklist_invite: "Invitez votre premier membre",
    fam_org_checklist_security: "Vérifiez les paramètres de sécurité",
    fam_org_stat_members: "Membres",
    fam_org_stat_storage_used: "Stockage utilisé",
    fam_org_stat_unassigned: "Non attribué",
    fam_org_stat_seats_available: "{{count}} places disponibles",
    fam_org_stat_seats_available_plural: "{{count}} places disponibles",
    fam_org_stat_pending: "{{count}} en attente",
    fam_org_stat_of_total: "sur {{total}} au total",
    fam_org_preview_more: "+{{count}} de plus",
    fam_org_preview_owner: "Propriétaire",
    fam_org_preview_manage: "Gérer",
    fam_org_summary_security: "Sécurité",
    fam_org_summary_checking: "Vérification de la conformité...",
    fam_org_summary_all_2fa: "Tous les membres ont la 2FA",
    fam_org_summary_partial_2fa: "{{compliant}}/{{total}} ont la 2FA",
    fam_org_seats_full_notice:
      "Les 2 places sont utilisées. Passez au forfait Famille pour jusqu'à 6 membres.",
    fam_org_upgrade: "Mettre à niveau",
    fam_org_manage_billing_plan:
      "Gérer la facturation et les changements de forfait",
    fam_org_no_members_title: "Aucun membre pour l'instant",
    fam_org_no_members_desc: "Invitez quelqu'un à partager ce forfait Famille",
    fam_org_members_info_title: "Membres",
    fam_org_members_info_desc:
      "Toutes les personnes de votre forfait Famille. Chaque membre dispose de son propre compte séparé et chiffré. En tant que propriétaire, vous pouvez inviter des personnes, définir l'allocation de stockage de chaque membre, transférer la propriété ou retirer des membres.",
    fam_org_add_member: "Ajouter un membre",
    fam_org_gb: "Go",
    fam_org_revoke_link_first: "Révoquez d'abord le lien existant",
    fam_org_storage_used_label: "{{size}} utilisé",
    fam_org_storage_remaining_label: "{{size}} restant",
    fam_org_invite_cancel: "Annuler",
    fam_org_invite_allocated: "{{count}} Go alloués",
    fam_org_invite_sent_ago: "envoyée {{time}}",
    fam_org_wizard_welcome: "Bienvenue dans votre forfait Famille",
    fam_org_wizard_setup_desc: "Assistant de configuration du forfait Famille",
    fam_org_wizard_storage_summary:
      "{{storage}} de stockage partagé - jusqu'à {{count}} membres",
    fam_org_wizard_feat_members: "Membres",
    fam_org_wizard_feat_members_desc:
      "Invitez jusqu'à {{count}} personnes, définissez le stockage par membre",
    fam_org_wizard_feat_security: "Sécurité",
    fam_org_wizard_feat_security_desc:
      "Exigez la 2FA, limitez les sessions, bloquez le transfert",
    fam_org_wizard_feat_groups: "Groupes",
    fam_org_wizard_feat_groups_desc:
      "Acheminez le courrier vers plusieurs membres à la fois",
    fam_org_wizard_feat_filters: "Filtres",
    fam_org_wizard_feat_filters_desc:
      "Règles de blocage, d'archivage et d'étiquetage à l'échelle de l'organisation",
    fam_org_wizard_feat_domains: "Domaines",
    fam_org_wizard_feat_domains_desc:
      "Partagez des domaines personnalisés entre les membres",
    fam_org_wizard_feat_retention: "Conservation",
    fam_org_wizard_feat_retention_desc:
      "Supprimez automatiquement la corbeille, les indésirables et l'ancien courrier",
    fam_org_wizard_not_now: "Pas maintenant",
    fam_org_wizard_get_started: "Commencer",
    fam_org_wizard_invite_title: "Invitez votre premier membre",
    fam_org_wizard_invite_desc:
      "Ils recevront un e-mail avec un lien pour rejoindre.",
    fam_org_wizard_member_placeholder: "member@example.com",
    fam_org_wizard_storage_label: "Stockage pour ce membre",
    fam_org_wizard_pool_remaining: "{{count}} Go restants dans le pool",
    fam_org_wizard_back: "Retour",
    fam_org_wizard_skip: "Ignorer pour l'instant",
    fam_org_wizard_send_invite: "Envoyer l'invitation",
    fam_org_wizard_done_title_sent:
      "Invitation envoyée - explorez votre forfait",
    fam_org_wizard_done_title: "Explorez votre forfait Famille",
    fam_org_wizard_done_desc_sent:
      "Invitation envoyée à {{email}}. Ils ont 7 jours pour accepter.",
    fam_org_wizard_done_desc:
      "Voici tout ce que vous pouvez configurer depuis les onglets ci-dessus.",
    fam_org_wizard_invite_sent_to: "Invitation envoyée à {{email}}",
    fam_org_wizard_grid_security: "Sécurité",
    fam_org_wizard_grid_security_desc:
      "Exigez la 2FA et définissez des limites de session pour tous les membres",
    fam_org_wizard_grid_groups: "Groupes",
    fam_org_wizard_grid_groups_desc:
      "Créez des boîtes partagées qui acheminent vers plusieurs membres",
    fam_org_wizard_grid_filters: "Filtres",
    fam_org_wizard_grid_filters_desc:
      "Bloquez des expéditeurs et appliquez des règles à toutes les boîtes des membres",
    fam_org_wizard_grid_domains: "Domaines",
    fam_org_wizard_grid_domains_desc:
      "Partagez un domaine personnalisé pour que les membres puissent envoyer depuis celui-ci",
    fam_org_wizard_grid_retention: "Conservation",
    fam_org_wizard_grid_retention_desc:
      "Définissez des calendriers de suppression automatique pour la corbeille, les indésirables et le courrier envoyé",
    fam_org_wizard_grid_activity: "Journal d'activité",
    fam_org_wizard_grid_activity_desc:
      "Voyez chaque action administrative : invitations, retraits, changements de politique",
    fam_org_wizard_done: "Terminé",
    fam_org_plan_upgraded: "Forfait mis à niveau avec succès",
    fam_org_invalid_email: "Saisissez une adresse e-mail valide",
    fam_org_invalid_storage: "Saisissez un stockage d'au moins 1 Go",
    fam_org_invite_revoked_toast: "Invitation révoquée",
    fam_org_member_removed_toast: "Membre retiré",
    fam_org_admin_transferred_toast: "Administration transférée",
    title: "Paramètres",
    general: "Général",
    account: "Compte",
    appearance: "Apparence",
    security: "Sécurité",
    security_description: "Préférences de confidentialité et de sécurité",
    notifications: "Notifications",
    notifications_denied_help:
      "Les notifications sont bloquées par votre navigateur. Activez-les dans les paramètres du site de votre navigateur pour les autoriser.",
    preferences: "Préférences",
    compose: "Rédaction",
    templates: "Modèles",
    feedback: "Commentaires",
    feedback_description: "Dites-nous comment nous pouvons nous améliorer",
    language: "Langue",
    language_description: "Choisissez votre langue préférée",
    theme: "Thème",
    theme_description: "Sélectionnez votre palette de couleurs préférée",
    theme_light: "Clair",
    theme_dark: "Sombre",
    theme_system: "Système",
    color_theme: "Thème de couleur",
    color_theme_description:
      "Choisissez une palette de couleurs prédéfinie pour l'app",
    color_theme_default: "Par défaut",
    color_theme_purple: "Violet",
    color_theme_green: "Vert",
    color_theme_rose: "Rose",
    color_theme_orange: "Orange",
    color_theme_teal: "Sarcelle",
    color_theme_indigo: "Indigo",
    color_theme_amber: "Ambre",
    color_theme_cyan: "Cyan",
    color_theme_slate: "Ardoise",
    color_theme_aster_blue: "Aster Blue",
    color_theme_lime: "Citron vert",
    color_theme_fuchsia: "Fuchsia",
    custom_theme_title: "Thème personnalisé",
    custom_theme_description:
      "Créez votre propre palette de couleurs à partir d'une seule couleur, générée en toute sécurité sur votre appareil",
    custom_theme_colors_title: "Couleurs du thème",
    custom_theme_color_label: "Couleur de base",
    language_format_title: "Langue et format",
    custom_theme_active: "Actuellement appliqué",
    custom_theme_inactive:
      "Choisissez une couleur pour appliquer votre thème personnalisé",
    custom_theme_role_accent: "Couleur d’accent",
    custom_theme_role_accent_hover: "Accent (survol)",
    custom_theme_role_background: "Arrière-plan",
    custom_theme_role_background_secondary: "Arrière-plan (secondaire)",
    custom_theme_role_text: "Texte",
    custom_theme_role_text_secondary: "Texte (secondaire)",
    custom_theme_role_border: "Bordure",
    custom_theme_reset_role: "Réinitialiser en automatique",
    custom_theme_reset_all: "Tout réinitialiser en automatique",
    font_choice_title: "Police",
    font_choice_description: "Choisissez la police utilisée dans toute l'app",
    font_option_default: "Police par défaut d'Aster",
    font_option_system: "Police système",
    email_font_choice_title: "Police des e-mails",
    email_font_choice_description: "Police utilisée pour lire les e-mails",
    email_font_option_match_app: "Identique à l'application",
    email_address: "Adresse e-mail",
    email_address_description: "Votre adresse e-mail principale",
    display_name: "Nom d'affichage",
    display_name_description: "Nom affiché aux destinataires",
    signature: "Signature",
    signature_description: "Paramètres de la signature e-mail",
    signature_disabled: "Désactivée",
    signature_enabled: "Activée",
    signature_custom: "Personnalisée",
    custom_signature: "Signature personnalisée",
    time_zone: "Fuseau horaire",
    time_zone_description: "Votre fuseau horaire local",
    time_zone_auto: "Automatique (fuseau de l'appareil)",
    time_zone_search_placeholder: "Rechercher une ville ou une région",
    time_zone_no_results: "Aucun fuseau horaire correspondant",
    time_zone_show_all: "Afficher tous les fuseaux horaires",
    date_format: "Format de date",
    date_format_description: "Comment les dates sont affichées",
    density: "Densité",
    density_description: "Ajuster l'espacement des éléments",
    density_comfortable: "Confortable",
    density_compact: "Compacte",
    auto_save_drafts: "Enregistrement automatique des brouillons",
    auto_save_drafts_description:
      "Enregistrer automatiquement les brouillons pendant la rédaction",
    desktop_notifications: "Notifications de bureau",
    desktop_notifications_description:
      "Recevoir des notifications pour les nouveaux e-mails",
    email_notifications: "Notifications par e-mail",
    email_notifications_description: "Recevoir des résumés par e-mail",
    sound: "Son",
    sound_description: "Jouer un son pour les nouveaux e-mails",
    two_factor_auth: "Authentification à deux facteurs",
    two_factor_auth_description:
      "Ajouter une couche de sécurité supplémentaire",
    encryption_keys: "Clés de chiffrement",
    encryption_keys_description:
      "Vos clés de chiffrement sont stockées de manière sécurisée en mémoire",
    end_to_end_encryption: "Chiffrement de bout en bout",
    always_on: "Toujours activé",
    your_encryption_key: "Votre clé OpenPGP",
    key_fingerprint: "Code de vérification",
    info_fingerprint_title: "Qu'est-ce que ce code ?",
    info_fingerprint_description:
      "Un court code créé à partir de votre clé de chiffrement. Si la personne avec qui vous correspondez compare ce code avec le sien et qu'ils correspondent, vous pouvez tous les deux être sûrs que vos messages sont privés et n'ont pas été modifiés.",
    copy_fingerprint: "Copier le code de vérification",
    copy_public_key: "Copier la clé publique",
    view_public_key: "Afficher la clé publique",
    failed_download_codes:
      "Impossible de télécharger les codes de récupération. Veuillez réessayer.",
    export_keys: "Exporter les clés et codes de récupération",
    recovery_codes: "Codes de récupération",
    changes_saved_automatically:
      "Les modifications sont enregistrées automatiquement",
    reset: "Réinitialiser",
    behavior: "Comportement",
    behavior_description: "Personnaliser le comportement de l'application",
    developer: "Développeur",
    developer_description:
      "Outils de développement et informations de débogage",
    updates: "Mises a jour",
    updates_description:
      "Verifier les mises a jour et configurer la mise a jour automatique",
    updates_check_now: "Verifier les mises a jour",
    updates_checking: "Verification des mises a jour...",
    updates_up_to_date: "Vous utilisez la derniere version",
    updates_check_failed:
      "La recherche de mises à jour a échoué. Réessayez dans un instant.",
    updates_install_failed:
      "La mise à jour ne s'est pas installée. Réessayez ou téléchargez la dernière version sur astermail.org/download.",
    updates_available: "Mise a jour disponible: {{version}}",
    updates_current_version: "Version actuelle: {{version}}",
    updates_install_and_restart: "Installer et redemarrer",
    updates_installing: "Telechargement de la mise a jour... {{percent}}%",
    updates_downloading: "Telechargement de la mise a jour...",
    updates_last_checked: "Verifiee la derniere fois {{when}}",
    updates_never_checked: "Jamais verifiee",
    updates_auto_label: "Rechercher les mises a jour automatiquement",
    updates_auto_description:
      "Aster Mail recherche les nouvelles versions et vous previent quand l'une est prete a installer.",
    updates_release_notes: "Notes de version",
    updates_banner_title: "Aster Mail {{version}} est disponible",
    updates_banner_action: "Installer maintenant",
    updates_unsupported:
      "Les mises a jour sont gerees par votre systeme d'exploitation ou navigateur",
    updates_dismiss: "Plus tard",
    billing: "Facturation",
    billing_description: "Gérer votre abonnement et vos moyens de paiement",
    undo_send: "Annuler l'envoi",
    undo_send_description:
      "Configurer le délai d'envoi des e-mails pour pouvoir annuler",
    blocked: "Bloqué",
    blocked_description: "Gérer les expéditeurs bloqués",
    accessibility: "Accessibilité",
    encryption: "Chiffrement",
    aliases_and_domains: "Alias et domaines",
    ghost_aliases: "Alias fantômes",
    snooze: "Mise en veille",
    mail_management: "Gestion du courrier",
    change_appearance: "Changer l'apparence d'Aster",
    security_settings: "Paramètres de sécurité",
    login_alerts_sessions_title: "Alertes de connexion et sessions",
    manage_security_description:
      "Gérer la sécurité de votre compte et les préférences d'authentification",
    session_timeout: "Expiration de la session",
    session_timeout_disabled: "L'expiration de la session est désactivée",
    timeout_duration: "Durée d'expiration",
    timeout_logout_description:
      "Vous serez déconnecté après cette période d'inactivité. Vous devrez vous reconnecter.",
    login_alerts: "Alertes de connexion",
    login_alerts_description:
      "Être notifié des nouvelles connexions à votre compte",
    recent_sign_ins: "Connexions recentes",
    no_sign_in_history: "Aucun historique de connexion",
    external_link_warnings: "Avertissements de liens externes",
    external_link_warning_enabled:
      "Afficher un avertissement avant d'ouvrir des liens externes dans les e-mails",
    external_link_warning_disabled:
      "Les liens s'ouvrent directement sans confirmation",
    ipfs_attachment_storage: "Stockage des pièces jointes IPFS",
    ipfs_enabled_description:
      "Les pièces jointes sont stockées sur le stockage décentralisé IPFS",
    ipfs_disabled_description:
      "Stocker les pièces jointes sur IPFS pour un stockage décentralisé et résilient",
    forward_secrecy: "Confidentialité persistante",
    forward_secrecy_disable_title:
      "Désactiver la confidentialité persistante ?",
    forward_secrecy_disable_message:
      "Les nouveaux messages n'utilisent plus de clés rotatives, donc une clé divulguée plus tard peut déchiffrer une plus grande partie de votre courrier. Vous pouvez la réactiver à tout moment.",
    login_alerts_disable_title: "Désactiver les alertes de connexion ?",
    login_alerts_disable_message:
      "Vous ne recevez plus d'e-mail lorsqu'un nouvel appareil se connecte à votre compte.",
    turn_off_action: "Désactiver",
    forward_secrecy_enabled_description:
      "Les clés sont renouvelées {{frequency}}",
    forward_secrecy_disabled_description:
      "Renouveler automatiquement les clés de chiffrement pour une sécurité renforcée",
    forward_secrecy_setup_failed:
      "Impossible d’activer la confidentialité persistante. Vérifiez votre connexion et réessayez.",
    current_key_status: "État actuel de la clé",
    age: "Ancienneté",
    fingerprint: "Empreinte",
    pgp_key_checking: "Recherche d'une clé PGP...",
    pgp_key_found: "Clé PGP trouvée",
    pgp_key_not_found: "Aucune clé PGP enregistrée",
    pgp_key_discovered_via: "Découverte via {source}",
    key_rotation_interval: "Intervalle de renouvellement des clés",
    key_history_limit: "Limite de l'historique des clés",
    key_history_description:
      "Les anciennes clés sont conservées pour déchiffrer les anciens e-mails. Définir sur illimité pour un historique complet.",
    rotate_keys_now: "Renouveler les clés maintenant",
    rotate_keys_description:
      "Renouveler manuellement vos clés de chiffrement. Les anciens e-mails resteront lisibles.",
    password: "Mot de passe",
    change_password: "Changer le mot de passe",
    change_password_description: "Changer le mot de passe de votre compte",
    password_last_updated: "Dernière mise à jour le {{date}}.",
    current_password: "Mot de passe actuel",
    new_password: "Nouveau mot de passe",
    confirm_new_password: "Confirmer le nouveau mot de passe",
    enter_current_password: "Saisir le mot de passe actuel",
    enter_new_password: "Saisir le nouveau mot de passe",
    confirm_new_password_placeholder: "Confirmer le nouveau mot de passe",
    passwords_do_not_match: "Les mots de passe ne correspondent pas",
    password_min_length: "Le mot de passe doit contenir au moins 8 caractères",
    password_max_length:
      "Le mot de passe doit contenir moins de 128 caractères",
    user_not_found: "Utilisateur non trouvé",
    session_expired_sign_in: "Session expirée. Veuillez vous reconnecter.",
    current_password_incorrect: "Le mot de passe actuel est incorrect",
    failed_change_password: "Échec du REDACTEDnt de mot de passe",
    plan_badge_star: "Star",
    plan_badge_nova: "Nova",
    plan_badge_supernova: "Supernova",
    plan_badge_aria: "Abonné {{plan}}",
    plan_badge_thanks: "Merci d'être abonné {{plan}}.",
    alias_reencrypt_failed:
      "Impossible de rechiffrer en toute sécurité l'un de vos alias. Votre mot de passe n'a pas été modifié. Veuillez contacter le support ou supprimer l'alias concerné, puis réessayer.",
    contact_reencrypt_failed:
      "Impossible de rechiffrer en toute sécurité l'un de vos contacts. Votre mot de passe n'a pas été modifié. Veuillez contacter le support ou supprimer le contact concerné, puis réessayer.",
    password_change_client_upgrade_required:
      "Cette version d'Aster Mail ne peut pas modifier votre mot de passe. Installez la dernière version, puis réessayez.",
    password_change_reencryption_incomplete:
      "Certains de vos alias n'ont pas fini d'être rechiffrés, votre mot de passe n'a donc pas été modifié. Réessayez et contactez l'assistance si le problème persiste.",
    password_change_fingerprint_mismatch:
      "Cette session a démarré sur un autre réseau ou un autre navigateur, donc Aster Mail n'a pas modifié votre mot de passe. Pour le modifier, déconnectez-vous, reconnectez-vous, puis réessayez.",
    update_password: "Mettre à jour le mot de passe",
    updating: "Mise à jour...",
    password_change_encrypted_data_warning:
      "Vos libellés, signatures et modèles sont rechiffrés lors d'un changement de mot de passe. Si votre connexion s'interrompt pendant ce processus, ces données ne pourront pas être récupérées.",
    password_changed_items_unreadable:
      "Votre mot de passe a changé. {{count}} éléments chiffrés ont conservé leur chiffrement précédent, car leur clé n'était pas disponible. La distribution du courrier n'est pas affectée. Pour les restaurer, contactez l'assistance.",
    password_change_background_reencrypt_failed:
      "Votre mot de passe a été modifié, mais une partie de vos messages envoyés et de vos réglages n’a pas fini d’être rechiffrée. Contactez l’assistance si des messages ou des réglages semblent illisibles.",
    password_changed_signing_out:
      "Mot de passe changé avec succès. Déconnexion en cours...",
    password_changed_success: "Mot de passe modifié",
    session_security: "Sécurité de la session",
    browsers_and_devices: "Navigateurs et appareils",
    session_privacy_description:
      "Pour votre confidentialité, nous ne suivons pas les détails de session ni les informations sur l'appareil",
    sign_out_everywhere: "Se déconnecter partout ailleurs",
    signing_out: "Déconnexion...",
    sign_out_description:
      "Cela vous déconnectera de tous les autres appareils et navigateurs",
    sign_out_everywhere_confirm:
      "Êtes-vous sûr de vouloir vous déconnecter partout ? Cela mettra fin à toutes les autres sessions actives.",
    sign_out_everywhere_success: "Déconnecté de {{count}} autre(s) session(s)",
    failed_sign_out: "Échec de la déconnexion des autres sessions",
    active_now: "Actif maintenant",
    minutes_ago: "Il y a {{count}} minutes",
    hours_ago: "Il y a {{count}} heures",
    days_ago: "Il y a {{count}} jours",
    this_device: "Cet appareil",
    signed_in_date: "Connecté le {{date}}",
    sign_out: "Se déconnecter",
    sign_out_all_other: "Déconnecter toutes les autres sessions",
    sign_out_session_confirm:
      "Êtes-vous sûr de vouloir déconnecter cette session ?",
    no_active_sessions: "Aucune session active trouvée",
    failed_load_sessions: "Échec du chargement des sessions",
    failed_load_security_status:
      "Vos paramètres de sécurité ne se sont pas chargés. Réessayez.",
    load_more_sessions: "Charger {{count}} sessions supplémentaires",
    two_fa_enabled: "Activée ({{count}} codes de secours restants)",
    two_fa_add_security:
      "Ajoutez une couche de sécurité supplémentaire avec la 2FA",
    basics_section_title: "Bases",
    two_step_verification: "Vérification en deux étapes",
    two_step_verification_description:
      "Nous recommandons d'exiger un code de vérification en plus de votre mot de passe.",
    authenticator_app: "Application d'authentification",
    enable_2fa: "Activer la 2FA",
    setup_2fa: "Configurer",
    notifications_configure:
      "Configurez comment et quand vous recevez des notifications",
    notifications_enabled: "Notifications activées",
    notifications_blocked: "Notifications bloquées",
    notifications_not_supported: "Non pris en charge",
    permission_required: "Autorisation requise",
    notifications_enabled_description:
      "Vous recevrez des notifications de bureau pour les nouveaux e-mails",
    notifications_blocked_description:
      "Activez les notifications dans les paramètres de votre navigateur",
    notifications_unsupported_description:
      "Votre navigateur ne prend pas en charge les notifications",
    permission_required_description:
      "Accordez l'autorisation pour recevoir des notifications",
    channels: "Canaux",
    desktop: "Bureau",
    show_desktop_notifications: "Afficher les notifications de bureau",
    blocked_by_browser: "Bloqué par le navigateur",
    blocked_by_os: "Activez-les dans les réglages de notifications du système",
    open_system_notification_settings: "Ouvrir les Réglages",
    sound_new_notifications: "Jouer un son pour les nouvelles notifications",
    badge_count_setting: "Pastille des non lus",
    badge_count_setting_description:
      "Afficher le nombre de messages non lus sur l’icône de l’app",
    push: "Push",
    push_subscribe_failed:
      "Les notifications sont activées, mais la remise en arrière-plan n'a pas pu être configurée. Vous recevez des notifications uniquement lorsque Aster Mail est ouvert.",
    push_notifications_description:
      "Recevoir des notifications push sur mobile",
    events: "Événements",
    new_emails: "Nouveaux e-mails",
    new_email_description: "Quand vous recevez un nouvel e-mail",
    replies: "Réponses",
    replies_description: "Quand quelqu'un répond à votre e-mail",
    toast_position: "Position des notifications",
    toast_position_description: "Où les notifications apparaissent à l'écran",
    toast_position_top: "Haut",
    toast_position_top_right: "En haut à droite",
    toast_position_middle: "Au milieu",
    toast_position_bottom_right: "En bas à droite",
    toast_position_top_left: "En haut à gauche",
    toast_position_bottom_left: "En bas à gauche",
    toast_duration: "Durée des notifications",
    toast_duration_description:
      "Combien de temps les notifications restent affichées",
    toast_duration_default: "Par défaut (2 s)",
    toast_duration_long: "Longue (5 s)",
    toast_duration_longer: "Plus longue (10 s)",
    toast_duration_longest: "Maximale (20 s)",
    send_test_notification: "Envoyer une notification test",
    test_notification_blocked:
      "Activez les notifications de bureau pour les tester.",
    quiet_hours: "Heures calmes",
    enable_quiet_hours: "Activer les heures calmes",
    mute_notifications_description:
      "Couper les notifications pendant les heures définies",
    from: "De",
    to: "À",
    behavior_shortcuts: "Comportement et raccourcis",
    mark_as_read: "Marquer comme lu",
    mark_as_read_description: "Quand marquer les e-mails comme lus",
    emails_per_page: "E-mails par page",
    emails_per_page_description:
      "Nombre d'e-mails affichés par page dans la boîte de réception, les archives et les autres dossiers",
    immediately: "Immédiatement",
    after_1_second: "Après 1 seconde",
    after_3_seconds: "Après 3 secondes",
    never_manual: "Jamais (manuel uniquement)",
    auto_advance: "Après archivage ou suppression",
    reactions_enabled: "Réactions",
    reactions_enabled_description:
      "Permet de réagir aux messages avec des émojis et de voir les réactions des autres",
    auto_advance_description:
      "Quel e-mail ouvrir après avoir archivé ou supprimé celui en cours de lecture",
    auto_advance_next: "Aller à l'e-mail suivant",
    auto_advance_previous: "Aller à l'e-mail précédent",
    auto_advance_back: "Revenir à la liste des e-mails",
    reading_pane_position: "Position du volet de lecture",
    reading_pane_description: "Où afficher l'aperçu de l'e-mail",
    right_side: "Côté droit",
    bottom: "En bas",
    hidden_click_to_open: "Masqué (cliquer pour ouvrir)",
    default_reply: "Réponse par défaut",
    default_reply_description:
      "Action par défaut lors de la réponse aux e-mails",
    reply_to_sender: "Répondre à l'expéditeur",
    reply_to_all: "Répondre à tous",
    force_dark_mode_emails: "Forcer le mode sombre pour les e-mails",
    force_dark_mode_emails_description:
      "Toujours afficher le contenu des e-mails en mode sombre, en ignorant le style d'origine",
    translation: "Traduction",
    translate_incoming: "Traduire le courrier entrant",
    translate_incoming_description:
      "Traduisez les messages rédigés dans d'autres langues sur votre appareil.",
    translate_incoming_info:
      "La traduction s'effectue entièrement sur votre appareil avec des modèles auto-hébergés. Rien de ce que vous lisez n'est jamais envoyé à un service de traduction.",
    translate_off: "Désactivé",
    translate_ask: "Demander à chaque fois",
    translate_always: "Toujours traduire",
    translate_my_languages: "Langues que vous lisez",
    translate_my_languages_description:
      "Langues que vous lisez déjà. En mode « Demander à chaque fois », Aster ne proposera pas de les traduire. Pour qu'une langue reste aussi intacte en mode « Toujours traduire », ajoutez-la à « Ne jamais traduire ».",
    translate_never_languages: "Ne jamais traduire",
    translate_never_languages_description:
      "Ne jamais traduire le courrier dans ces langues, quel que soit le mode.",
    translate_add_language: "Ajouter une langue",
    translate_auto_detected: "Détecté automatiquement depuis votre appareil",
    translate_confirm_title: "Activer la traduction ?",
    translate_confirm_description:
      "Aster traduit le courrier sur votre appareil, donc rien de ce que vous lisez n'est envoyé à un service de traduction. La première fois que vous traduisez depuis une langue, Aster télécharge un pack linguistique de 20 à 55 Mo et le conserve sur cet appareil. Vous pouvez supprimer les packs à tout moment.",
    translate_confirm_enable: "Activer",
    translation_packs: "Packs linguistiques téléchargés",
    translation_packs_description:
      "Les packs linguistiques sont stockés sur cet appareil. Supprimez un pack pour libérer de l'espace. Aster le télécharge à nouveau la prochaine fois que vous traduisez cette langue.",
    translation_packs_empty:
      "Vous n'avez encore téléchargé aucun pack linguistique.",
    translation_packs_total: "{{size}} utilisés sur cet appareil",
    translation_packs_remove: "Supprimer",
    translation_packs_remove_all: "Tout supprimer",
    translation_packs_unavailable:
      "Ce navigateur ne peut pas stocker les packs linguistiques, donc Aster les télécharge à chaque traduction.",

    block_external_content: "Bloquer le contenu externe",
    block_external_content_description:
      "Bloquer le contenu externe jusqu'à ce que vous choisissiez de le charger",
    blocking_mode: "Mode de blocage",
    blocking_mode_description: "Choisir quel contenu externe bloquer",
    trackers_only: "Traqueurs uniquement",
    images_only: "Images uniquement",
    images_and_trackers: "Images et traqueurs",
    enable_undo_send: "Activer l'annulation d'envoi",
    undo_send_delay_description:
      "Retarder l'envoi des e-mails pour pouvoir annuler si nécessaire",
    cancellation_period: "Période d'annulation",
    cancellation_period_description:
      "Fenêtre de temps pour annuler un e-mail envoyé ({{min}}-{{max}} secondes)",
    protected_folders: "Dossiers protégés",
    protected_folders_description:
      "Configurer le comportement des dossiers protégés par mot de passe",
    folder_lock_mode: "Mode de verrouillage du dossier",
    folder_lock_mode_description:
      "Choisir quand les dossiers protégés doivent se verrouiller",
    lock_mode_session: "Déverrouillé pour la session",
    lock_mode_on_leave: "Verrouiller en quittant",
    auto_save_recipients_to_contacts:
      "Enregistrer automatiquement les destinataires récents dans les contacts",
    auto_save_recipients_to_contacts_description:
      "Ajoute automatiquement à vos contacts les adresses auxquelles vous écrivez",
    confirmations: "Confirmations",
    confirm_actions_description: "Demander une confirmation avant ces actions",
    confirm_delete: "Confirmer la suppression",
    confirm_delete_description:
      "Confirmer avant de supprimer définitivement des e-mails",
    confirm_archive: "Confirmer l'archivage",
    confirm_archive_description: "Confirmer avant d'archiver des e-mails",
    confirm_spam: "Confirmer le spam",
    confirm_spam_description:
      "Confirmer avant de marquer des e-mails comme indésirables",
    advanced: "Avancé",
    advanced_description: "Paramètres pour les utilisateurs avancés",
    developer_mode: "Mode développeur",
    developer_mode_description:
      "Afficher l'onglet Développeur avec les informations de build, l'état du chiffrement et les outils de débogage",
    close_to_tray: "Continuer a fonctionner a la fermeture de la fenetre",
    close_to_tray_description:
      "Aster Mail reste dans la zone de notification pour continuer a recevoir le nouveau courrier. Desactivez cette option pour quitter a la fermeture de la fenetre.",
    time_format: "Format de l'heure",
    time_format_description: "Choisir le format d'affichage de l'heure",
    twelve_hours: "12 heures",
    twenty_four_hours: "24 heures",
    email_view_mode: "Mode d'affichage des e-mails",
    email_view_description:
      "Choisir comment les e-mails s'ouvrent lorsque vous cliquez dessus",
    popup: "Fenêtre contextuelle",
    popup_description:
      "S'ouvre dans une fenêtre déplaçable et redimensionnable",
    split_view: "Vue partagée",
    split_view_description:
      "Affiche la liste des e-mails et l'aperçu côte à côte",
    full_page: "Pleine page",
    full_page_description:
      "Ouvre l'e-mail en vue pleine largeur sans la liste de la boîte de réception",
    thread_count_position: "Position du badge de comptage de fils",
    thread_count_position_description:
      "Choisissez où le badge de comptage de fils apparaît par rapport au nom de l'expéditeur",
    thread_count_left: "À gauche de l'expéditeur",
    thread_count_right: "À droite de l'expéditeur",
    compose_window_mode: "Mode de la fenêtre de composition",
    compose_window_mode_description:
      "Choisissez comment la fenêtre de composition s'ouvre par défaut",
    compose_mode_default: "Par défaut - popup flottante",
    compose_mode_fullscreen: "Toujours en plein écran",
    compose_mode_minimized: "Démarrer réduit",
    compose_defaults_title: "Mise en forme par défaut",
    compose_defaults_description:
      "Choisissez l'apparence des nouveaux messages au moment où vous commencez à écrire. Les réponses et les messages transférés conservent leur mise en forme d'origine.",
    compose_default_font_size: "Taille de police par défaut",
    compose_default_font_size_description:
      "Les nouveaux messages commencent avec cette taille. Vous pouvez toujours modifier la taille pendant que vous écrivez.",
    compose_default_font_color: "Couleur du texte par défaut",
    compose_default_font_color_description:
      "Les nouveaux messages commencent avec cette couleur. Choisissez la couleur par défaut du thème pour suivre le thème de l'application.",
    compose_default_font_color_picker_label:
      "Choisissez une couleur de texte par défaut",
    compose_default_font_color_theme: "Valeur par défaut du thème",
    compose_default_font_color_reset: "Utiliser la valeur par défaut du thème",
    build_info: "Informations de build",
    release: "Version",
    build: "Version",
    environment: "Environnement",
    platform: "Plateforme",
    crypto_status: "État cryptographique",
    vault: "Coffre-fort",
    loaded: "Chargé",
    not_loaded: "Non chargé",
    passphrase: "Phrase secrète",
    cached: "En cache",
    not_cached: "Pas en cache",
    key_age: "Ancienneté de la clé",
    wkd: "WKD",
    published: "Publié",
    not_published: "Non publié",
    keyserver: "Serveur de clés",
    session_account: "Session et compte",
    user_id: "ID utilisateur",
    session_duration: "Durée de la session",
    user_agent: "Agent utilisateur",
    email_statistics: "Statistiques des e-mails",
    total_emails: "Total des e-mails",
    archived: "Archivé",
    custom_folders: "Dossiers personnalisés",
    storage: "Stockage",
    performance: "Performances",
    page_load: "Chargement de la page",
    dom_ready: "DOM prêt",
    js_heap: "Tas JS",
    screen: "Écran",
    viewport: "Zone d'affichage",
    network: "Réseau",
    status: "État",
    online: "En ligne",
    connection:
      "Tor est encore en train de se connecter, et nous avons bloqué cette requête pour empêcher votre trafic de fuir. Un instant pour que Tor finisse, puis un autre essai, fonctionnera.",
    speed: "Vitesse",
    latency: "Latence",
    service_worker: "Service Worker",
    local_storage: "LocalStorage",
    session_storage: "SessionStorage",
    indexed_db: "IndexedDB",
    actions: "Actions",
    export_debug_report: "Exporter le rapport de débogage",
    refresh_crypto_status: "Actualiser l'état cryptographique",
    force_reload: "Forcer le rechargement",
    unregister_service_workers: "Désenregistrer les Service Workers",
    clear_cache_reload: "Vider tout le cache et recharger",
    clear_cache_confirm_message:
      "Cette action efface les données en cache sur cet appareil et recharge Aster Mail. Vous devrez peut-être vous reconnecter.",
    current_plan: "Forfait actuel",
    free: "Gratuit",
    available_plans: "Forfaits disponibles",
    current: "Actuel",
    manage_payment: "Gérer le paiement",
    reactivate: "Réactiver",
    manage_plan: "Gérer le forfait",
    manage_plan_description: "Modifier votre abonnement",
    cancel_plan_warning:
      "Vous conserverez les fonctionnalités premium jusqu'à la fin de cette période de facturation, puis votre plan passera au plan gratuit. Votre courrier, vos contacts et vos paramètres restent avec vous.",
    cancel_plan: "Annuler le forfait",
    billing_history: "Historique de facturation",
    billing_desc_payment_failed: "Échec du paiement",
    billing_desc_refund_processed: "Remboursement traité",
    billing_desc_payment_disputed: "Paiement contesté : {{reason}}",
    billing_desc_crypto_payment:
      "{{plan}}, durée de {{months}} mois, payé avec {{currency}} sur {{chain}}",
    billing_desc_crypto_credit:
      "{{plan}}, durée de {{months}} mois, crédité en {{currency}} sur {{chain}}",
    billing_desc_crypto_prepaid:
      "{{plan}}, durée de {{months}} mois, prépayé en cryptomonnaie",
    credit_desc_applied_invoice: "Appliqué à une facture",
    credit_desc_applied_storage: "Appliqué à une option de stockage",
    credit_desc_applied_subscription_checkout:
      "Appliqué à un paiement d'abonnement",
    credit_desc_applied_subscription_payment:
      "Appliqué au règlement d'un abonnement",
    credit_desc_returned_checkout_not_started:
      "Remboursé car le paiement n'a pas pu démarrer",
    credit_desc_returned_checkout_incomplete:
      "Remboursé car le paiement n'a pas été finalisé",
    credit_desc_returned_payment_failed:
      "Remboursé car le paiement différé a échoué",
    credit_desc_reversed_invoice_voided: "Annulé car la facture a été annulée",
    credit_desc_reversed_refunded:
      "Annulé car l'achat a été remboursé ou contesté",
    credit_desc_referral_commission:
      "Commission de parrainage pour l'abonnement d'un ami",
    credit_desc_reversal_crypto_overpayment:
      "Annulation d'un crédit de trop-perçu en crypto",
    credit_desc_reversal_prepaid_residual:
      "Annulation d'un crédit de changement de forfait prépayé",
    credit_desc_unused_prepaid:
      "Temps prépayé inutilisé de votre forfait précédent",
    credit_desc_purchased: "Achat de {{amount}} de crédits",
    credit_desc_referral_reversed:
      "Commission de parrainage annulée : {{reason}}",
    credit_desc_install_bonus: "Bonus d'installation pour l'app de bureau",
    credit_desc_crypto_overpayment:
      "Crédit de trop-perçu en {{currency}} sur {{chain}}",
    storage_limit_exceeded: "Votre stockage est plein.",
    storage_limit_description:
      "Le nouveau courrier est en pause jusqu'à ce que vous libériez de l'espace. Effacer quelques messages, ou mettre à niveau votre plan, le laissera circuler à nouveau. Le courrier existant est en sécurité.",
    cancel_subscription: "Annuler l'abonnement",
    cancel_subscription_description:
      "Votre abonnement restera actif jusqu'à la fin de la période de facturation en cours. Après cela, vous serez basculé vers le forfait gratuit.",
    keep_plan: "Garder le forfait",
    cancelling: "Annulation...",
    continue_to_checkout: "Continuer vers le paiement",
    redirect_payment_description:
      "Vous serez redirigé vers notre fournisseur de paiement sécurisé pour finaliser votre achat.",
    billing_unavailable:
      "Les paiements sont momentanément indisponibles. Réessayez dans quelques minutes.",
    checkout_rate_limited:
      "Trop de tentatives. Patientez une minute, puis réessayez.",
    checkout_already_active:
      "Vous avez déjà un abonnement actif. Actualisez la page pour le voir.",
    checkout_session_mismatch:
      "Votre session a démarré sur un autre réseau ou navigateur. Déconnectez-vous, reconnectez-vous, puis réessayez.",
    checkout_family_group_member:
      "Vous appartenez déjà à un groupe familial. Quittez-le avant d'en créer un nouveau.",
    checkout_family_plan_active:
      "Votre forfait famille est déjà actif. Actualisez la page pour le voir.",
    checkout_crypto_open_invoice_limit:
      "Vous avez trop de factures crypto ouvertes. Terminez-en une ou annulez-la, puis réessayez.",
    checkout_crypto_active_card:
      "Annulez votre abonnement par carte avant de payer en crypto.",
    checkout_unpaid_subscription:
      "Votre dernière facture est impayée. Réglez-la dans Réglages, Facturation, puis réessayez.",
    checkout_pending_cancellation:
      "Votre abonnement doit être résilié. Réactivez le renouvellement avant de changer de forfait.",
    checkout_duplicate_subscription:
      "Vous avez déjà cet abonnement. Actualisez la page pour le voir.",
    checkout_provider_unreachable:
      "Notre prestataire de paiement ne répond pas. Patientez une minute, puis réessayez. Rien n'a été débité.",
    checkout_sca_required:
      "Votre banque doit confirmer ce paiement. Suivez les instructions de votre banque, puis réessayez.",
    checkout_card_declined:
      "Votre banque a refusé la carte. Utilisez une autre carte ou contactez votre banque.",
    checkout_collection_failed:
      "Nous n'avons pas pu encaisser le paiement. Mettez à jour votre moyen de paiement dans Réglages, Facturation, puis réessayez.",
    plan_not_available:
      "Ce plan n'est pas disponible à l'achat pour l'instant. Un autre plan, ou un nouvel essai plus tard, fonctionnera.",
    failed_checkout:
      "Nous n'avons pas pu ouvrir le paiement tout de suite. Un autre essai devrait suffire. Votre facturation est inchangée.",
    failed_billing_portal:
      "Nous n'avons pas pu ouvrir le portail de facturation. Un autre essai devrait suffire. Votre plan est inchangé.",
    subscription_cancelled:
      "L'abonnement sera annulé à la fin de la période de facturation",
    failed_cancel_subscription:
      "Votre annulation n'est pas passée. Un autre essai devrait suffire. Votre plan est toujours actif.",
    subscription_reactivated: "Abonnement réactivé",
    failed_reactivate:
      "Nous n'avons pas pu réactiver votre plan. Un autre essai devrait suffire.",
    daily: "Quotidien",
    weekly: "Hebdomadaire",
    biweekly: "Bihebdomadaire",
    monthly: "Mensuel",
    unlimited: "Illimité",
    test_notification: "Notification de test",
    test_notification_body: "Ceci est une notification de test d'Aster Mail",
    five_minutes: "5 minutes",
    fifteen_minutes: "15 minutes",
    thirty_minutes: "30 minutes",
    one_hour: "1 heure",
    two_hours: "2 heures",
    four_hours: "4 heures",
    eight_hours: "8 heures",
    five_keys: "5 clés",
    ten_keys: "10 clés",
    twenty_five_keys: "25 clés",
    auto_lock_after: "Verrouillage automatique après {{duration}} d'inactivité",
    hours: "{{count}} heures",
    days: "{{count}} jours",
    failed_get_auth_data:
      "Nous n'avons pas pu charger vos informations de connexion. Un autre essai devrait suffire.",
    downgrade: "Rétrograder",
    upgrade_to: "Passer à {{name}}",
    get_plan: "Choisir {{name}}",
    save_percent: "ÉCONOMISEZ {{percent}} %",
    downgrade_to: "Rétrograder vers {{name}}",
    payment: "Paiement",
    cancels: "Annulation le",
    renews: "Renouvellement le",
    your_feedback: "Votre commentaire",
    feedback_placeholder:
      "Partagez vos réflexions, suggestions ou signalez des problèmes...",
    feedback_not_encrypted:
      "Les commentaires ne sont pas chiffrés de bout en bout. N'incluez pas d'informations sensibles.",
    sending: "Envoi...",
    send_feedback_button: "Envoyer le commentaire",
    thank_you_feedback: "Merci pour votre commentaire !",
    feedback_category_general: "Commentaire",
    feedback_category_idea: "Idée",
    feedback_category_bug: "Bug",
    too_many_requests:
      "Vous faites cela trop rapidement. Veuillez patienter un instant et réessayer.",
    please_log_in_feedback:
      "Vous connecter vous permettra d'envoyer des commentaires.",
    failed_send_feedback:
      "Vos commentaires ne se sont pas envoyés. Un autre essai devrait suffire.",
    other_ways_to_reach: "Autres moyens de nous contacter",
    reset_to_defaults: "Réinitialiser par défaut",
    section_reset: "Section réinitialisée par défaut",
    reset_all_confirm: "Réinitialiser tous les paramètres par défaut ?",
    reset_section_confirm: "Réinitialiser cette section ?",
    reset_all_type_confirm:
      "Cela réinitialisera toutes vos préférences. Tapez RESET pour confirmer.",
    type_to_confirm: "Tapez {{text}} pour confirmer.",
    confirm_reset: "Confirmer la réinitialisation",
    delete_account_title: "Supprimer le compte",
    delete_account_permanent: "Cette action est définitive et irréversible",
    delete_account_description:
      "Tous vos e-mails, dossiers, contacts et clés de chiffrement seront définitivement supprimés. Vous ne pourrez récupérer aucune donnée associée à ce compte.",
    type_delete_confirm: "Pour confirmer la suppression, tapez",
    type_to_confirm_placeholder: "Tapez pour confirmer",
    enter_password_confirm: "Saisir votre mot de passe pour confirmer :",
    verifying_credentials: "Vérification des identifiants...",
    failed_verify_credentials:
      "Ce mot de passe ne correspondait pas. Un autre essai devrait fonctionner. Votre compte est inchangé.",
    deleting_account: "Suppression du compte...",
    failed_delete_account:
      "Nous n'avons pas pu supprimer votre compte. Vérifier votre mot de passe et réessayer suffit en général. Votre compte est inchangé.",
    error_deleting_account:
      "Nous n'avons pas pu supprimer votre compte tout de suite. Un autre essai dans un instant fonctionne en général, et hello@astermail.org peut aider si cela continue d'échouer.",
    "connection.title": "Connexion",
    "connection.description": "Choisir comment se connecter aux services Aster",
    "connection.title_info":
      "Aster prend en charge plusieurs routes vers ses serveurs. La route que vous choisissez change qui peut voir votre adresse IP et comment les requêtes nous parviennent. Vos messages restent chiffrés de bout en bout dans les deux cas.",
    "connection.direct": "Direct",
    "connection.direct_description":
      "Se connecter directement aux serveurs Aster",
    "connection.tor": "Tor",
    "connection.tor_description": "Acheminer le trafic via le réseau Tor",
    "connection.tor_snowflake": "Tor avec Snowflake",
    "connection.tor_snowflake_description":
      "Utiliser les ponts Snowflake pour résister à la censure",
    "connection.cdn_relay": "Relais CDN",
    "connection.cdn_relay_description": "Acheminer via les serveurs relais CDN",
    "connection.tor_warning":
      "Tout le trafic sera achemine via le reseau Tor. Des performances plus lentes sont a prevoir.",
    "connection.status_connected": "Connecté",
    "connection.status_connecting": "Connexion...",
    "connection.status_error":
      "Nous avons perdu la connexion, et nous réessayons de notre côté.",
    "connection.status_disconnected": "Déconnecté",
    "connection.tor_blocked":
      "Tor est désactivé, et nous avons bloqué cette requête pour empêcher votre trafic de fuir. Activer Tor le laissera passer.",
    "connection.tor_blocked_connecting":
      "Tor est encore en train de se connecter, et nous avons bloqué cette requête pour empêcher votre trafic de fuir. Un instant pour que Tor finisse, puis un autre essai, fonctionnera.",
    "connection.requires_native_app":
      "Disponible dans les applications de bureau et mobiles",
    "connection.requires_desktop_app":
      "Disponible dans l'application de bureau",
    "connection.coming_soon": "Bientôt disponible",
    domain_ownership_verification: "Vérification de la propriété du domaine",
    txt_record: "Enregistrement TXT",
    mail_routing: "Routage du courrier",
    mx_record: "Enregistrement MX",
    sender_policy_framework: "Sender Policy Framework",
    spf_record: "Enregistrement SPF (TXT)",
    email_signing: "Signature des e-mails",
    dkim_record: "Enregistrement DKIM (TXT)",
    email_authentication_policy: "Politique d'authentification des e-mails",
    dmarc_record: "Enregistrement DMARC (TXT)",
    tls_reporting: "Rapports TLS",
    tlsrpt_record: "Enregistrement TLS-RPT",
    tlsrpt_description:
      "Facultatif mais recommande. Les serveurs destinataires vous envoient un resume quotidien lorsque la remise chiffree vers votre domaine echoue, pour reperer les problemes avant vos utilisateurs.",
    dns_instruction_set_tlsrpt_host: "Definissez l'hote sur _smtp._tls",
    dns_instruction_set_tlsrpt_value:
      "Collez la valeur TLS-RPT exactement telle qu'affichee",
    optional_step: "Facultatif",
    gmail_import: "Gmail",
    gmail_import_description: "MBOX depuis Google Takeout",
    outlook_import: "Outlook",
    outlook_import_description: "Fichiers PST, MBOX ou EML",
    protonmail_import: "ProtonMail",
    protonmail_import_description: "Export MBOX ou EML",
    any_email_import: "Tout e-mail",
    any_email_import_description: "Fichiers MBOX, EML, CSV, PST",
    search_history: "Historique de recherche",
    folders_limit: "Dossiers",
    onboarding_compose_title: "Rédigez votre premier message",
    onboarding_compose_description:
      "Appuyez sur C dans votre boîte de réception pour commencer à écrire. Aster chiffre le message sur votre appareil avant l'envoi.",
    onboarding_search_title: "Trouvez tout, en toute confidentialité",
    onboarding_search_description:
      "Appuyez sur / pour accéder directement à la recherche. Affinez les résultats par expéditeur, date ou pièces jointes sans quitter le clavier.",
    delete_imported_emails_confirm: "Supprimer les e-mails importés ?",
    import_delete_warning:
      "Cette action supprime définitivement les messages issus de cette importation. Vous ne pouvez pas l'annuler.",
    all_emails_filter: "Tous les e-mails",
    choose_label_color: "Choisir la couleur du libellé",
    hex_color_value: "Valeur de couleur hexadécimale",
    fetch_imap_folders: "Récupérer les dossiers IMAP",
    imap_folder_selection: "Sélection des dossiers IMAP",
    fetch_folders_instruction:
      'Cliquez sur "Récupérer les dossiers" pour charger les dossiers IMAP disponibles.',
    test_incoming_connection: "Tester la connexion de courrier entrant",
    test_smtp_connection: "Tester la connexion SMTP",
    show_sync_error_details:
      "Afficher les détails de l'erreur de synchronisation",
    disable_two_factor_auth: "Désactiver l'authentification à deux facteurs",
    disable_2fa_description:
      "Saisissez le code de votre app d’authentification et votre mot de passe pour désactiver l’authentification à deux facteurs. Votre compte sera moins protégé.",
    authenticator_code: "Code de l'authentificateur",
    disabling: "Désactivation...",
    disable_2fa: "Désactiver la 2FA",
    setup_two_factor_auth: "Configurer l'authentification à deux facteurs",
    view_guide: "Voir le guide",
    two_factor_guide_title:
      "Comment fonctionne l'authentification à deux facteurs",
    two_factor_guide_step_app:
      "Ouvrez l'application d'authentification de votre choix sur votre téléphone.",
    two_factor_guide_step_scan:
      "Scannez le code QR avec l'application, ou saisissez la clé secrète manuellement si vous ne pouvez pas scanner.",
    two_factor_guide_step_code:
      "Saisissez ci-dessous le code à 6 chiffres généré par l'application pour terminer la configuration.",
    verify_2fa_setup:
      "Saisissez le code à 6 chiffres de votre application d'authentification pour vérifier la configuration",
    two_factor_auth_enabled: "Authentification à deux facteurs activée",
    backup_code_security_note:
      "Chaque code de secours ne peut être utilisé qu'une seule fois. Conservez-les en lieu sûr.",
    delete_alias_confirmation:
      "Êtes-vous sûr de vouloir supprimer cet alias ? Cette action est irréversible.",
    alias_too_new_title: "Cet alias est trop récent pour être supprimé",
    alias_too_new_message:
      "Les nouveaux alias restent actifs 30 jours avant de pouvoir être supprimés. Celui-ci peut être retiré à partir du {{date}}. Passez à Supernova pour supprimer les alias instantanément.",
    ghost_alias_too_new_title: "Cet alias fantôme est trop récent pour expirer",
    ghost_alias_too_new_message:
      "Les nouveaux alias fantômes restent actifs 30 jours avant de pouvoir expirer. Celui-ci peut expirer à partir du {{date}}. Passez à Supernova pour faire expirer les alias fantômes instantanément.",
    delete_signature_confirmation:
      "Voulez-vous vraiment supprimer cette signature ? Cette action est irréversible.",
    delete_domain_confirmation:
      "Êtes-vous sûr de vouloir supprimer ce domaine ? Cette action est irréversible.",
    delete_address_confirmation:
      "Êtes-vous sûr de vouloir supprimer cette adresse ? Cette action est irréversible.",
    colorblind_protanopia: "Protanopie",
    enable_undo_send_label: "Activer l'annulation d'envoi",
    cancellation_period_label: "Période d'annulation en secondes",
    delete_your_account: "Supprimer votre compte",
    auto_discover_keys_title:
      "Découverte automatique des clés des destinataires",
    encrypt_by_default_title: "Chiffrer par défaut",
    encrypt_by_default_description:
      "Chiffrer automatiquement lorsque la clé du destinataire est disponible",
    require_encryption_title: "Exiger le chiffrement",
    require_encryption_description:
      "Empêcher l'envoi non chiffré aux destinataires dont les clés sont connues",
    show_encryption_indicators_title: "Afficher les indicateurs de chiffrement",
    show_encryption_indicators_description:
      "Afficher des icônes de cadenas sur les messages chiffrés",
    publish_keys_wkd_title: "Publier les clés sur WKD",
    publish_keys_wkd_description:
      "Rendre vos clés découvrables via Web Key Directory",
    publish_to_keyservers_title: "Publier sur les serveurs de clés",
    publish_to_keyservers_description:
      "Rendre vos clés trouvables sur les serveurs de clés publics",
    info_forward_secrecy_title:
      "Qu'est-ce que la confidentialité persistante ?",
    info_forward_secrecy_description:
      "Vos clés de session tournent automatiquement. Même si quelqu'un obtenait votre clé privée aujourd'hui, il ne pourrait pas lire les anciens messages car chaque session utilisait une clé différente.",
    info_key_rotation_interval_title: "Intervalle de rotation des clés",
    info_key_rotation_interval_description:
      "La fréquence à laquelle votre clé de chiffrement est remplacée. Plus souvent est plus sûr, mais avec un peu plus de surcharge. Une semaine est un bon défaut pour la plupart.",
    info_key_history_limit_title: "Limite de l'historique des clés",
    info_key_history_limit_description:
      "Le nombre d'anciennes clés qu'Aster conserve pour déchiffrer les anciens e-mails. Trop bas et les anciens messages peuvent devenir illisibles.",
    info_wkd_title: "Qu'est-ce que WKD ?",
    info_wkd_description:
      "Un standard qui permet aux apps e-mail comme Thunderbird ou Proton de trouver automatiquement votre clé publique. Les contacts peuvent envoyer des mails chiffrés sans échange manuel.",
    info_keyservers_title: "Que sont les serveurs de clés ?",
    info_keyservers_description:
      "Des répertoires publics où les clés PGP sont recherchables par e-mail. Attention : sur la plupart des serveurs, les clés ne peuvent pas être entièrement supprimées après publication.",
    keyserver_urls_title: "URLs des serveurs de clés",
    keyserver_urls_description:
      "Serveurs de clés supplémentaires à rechercher et publier, en plus des serveurs par défaut (keys.openpgp.org)",
    keyserver_url_placeholder: "https://keys.example.com",
    keyserver_add: "Ajouter",
    keyserver_remove: "Supprimer",
    keyserver_defaults_label: "Serveurs de clés par défaut",
    keyserver_custom_label: "Serveurs de clés personnalisés",
    keyserver_invalid_url: "Entrez une URL HTTPS valide",
    keyserver_saved: "Liste des serveurs de clés enregistrée",
    keyserver_publication_status: "Statut de publication",
    keyserver_status_published: "Publié",
    keyserver_status_not_published: "Non publié",
    keyserver_status_awaiting: "Confirmation en attente",
    keyserver_status_failed: "Échec",
    keyserver_awaiting_hint:
      "Votre clé a été envoyée. Consultez votre boîte de réception pour l'e-mail de confirmation de keys.openpgp.org et cliquez sur le lien pour terminer la publication.",
    keyserver_failed_hint:
      "Le serveur de clés a rejeté votre clé. Essayez de la publier à nouveau.",
    keyserver_publish_btn: "Publier la clé",
    keyserver_republish_btn: "Re-publier la clé",
    keyserver_permanent_warning:
      "Une fois publiées, les clés ne peuvent pas être entièrement supprimées de la plupart des serveurs de clés.",
    keyserver_add_custom_label: "Ajouter un serveur personnalisé",
    info_require_encryption_title: "Exiger le chiffrement",
    info_require_encryption_description:
      "Envoie uniquement les e-mails qui peuvent être chiffrés de bout en bout. Si un destinataire n'a pas de clé PGP, le message ne sera pas envoyé.",
    info_storage_format_title: "Format de stockage",
    info_storage_format_description:
      "Aster Server stocke vos e-mails chiffrés sur les serveurs d'Aster. IPFS répartit vos données sur un réseau pair-à-pair. Dans les deux cas, seules vos clés peuvent déchiffrer le contenu.",
    info_block_fonts_title: "Pourquoi bloquer les polices distantes ?",
    info_block_fonts_description:
      "Les e-mails peuvent charger des polices depuis des serveurs externes. Le serveur de l'expéditeur voit alors votre IP et quand vous avez ouvert le message, comme un pixel espion.",
    info_block_css_title: "Pourquoi bloquer les feuilles de style distantes ?",
    info_block_css_description:
      "Les fichiers CSS dans les e-mails agissent comme des trackers cachés. Les charger dit au serveur de l'expéditeur votre IP, quand vous avez ouvert et quel appareil vous utilisez.",
    info_strip_exif_title: "Que sont les métadonnées d'image ?",
    info_strip_exif_description:
      "Les photos prises avec des téléphones et appareils photo contiennent des données cachées comme les coordonnées GPS, le modèle d'appareil, l'horodatage et les informations d'objectif. Aster les supprime avant l'envoi afin que les destinataires ne voient que les pixels.",
    info_spy_pixels_title: "Que sont les pixels espions ?",
    info_spy_pixels_description:
      "Des images 1x1 invisibles dans les e-mails. Au chargement, l'expéditeur voit votre IP, quand vous avez ouvert le message et votre type d'appareil. Aster les supprime avant qu'ils ne chargent.",
    info_folder_lock_mode_title: "Mode de verrouillage de dossier",
    info_folder_lock_mode_description:
      "Session verrouille le dossier à la fermeture de l'app. Au départ le verrouille dès que vous naviguez ailleurs, exigeant votre mot de passe à chaque retour.",
    info_block_remote_images_title: "Pourquoi bloquer les images distantes ?",
    info_block_remote_images_description:
      "Quand un e-mail charge des images depuis des serveurs externes, l'expéditeur peut voir votre adresse IP et quand vous l'avez ouvert. Les bloquer protège cette information.",
    info_remote_image_loading_title: "Options de chargement d'images",
    info_remote_image_loading_description:
      "Jamais : toujours bloquer. Demander : afficher une invite à chaque fois. Toujours : charger sans demander. Contrôle les exceptions à votre blocage d'images.",
    info_tracking_protection_title: "Protection contre le pistage",
    info_tracking_protection_description:
      "Empêche les e-mails de se connecter à l'extérieur quand vous les ouvrez. Les expéditeurs utilisent des pixels, polices et CSS pour savoir qui a ouvert leurs e-mails.",
    info_block_tracking_links_title: "Que sont les liens de suivi ?",
    info_block_tracking_links_description:
      "Les e-mails publicitaires ajoutent des étiquettes cachées à leurs liens, comme utm_source, fbclid et gclid. Elles indiquent à l'expéditeur de quelle campagne vous venez et confirment que vous avez cliqué. Aster les retire de chaque lien du message, si bien que le lien ouvre toujours la même page sans rien signaler.",
    info_two_factor_auth_title: "Authentification à deux facteurs",
    info_two_factor_auth_description:
      "Ajoute une deuxième couche de sécurité à la connexion. Après votre mot de passe, vous saisissez un code à 6 chiffres depuis votre application d'authentification.",
    info_session_timeout_title: "Expiration de session",
    info_session_timeout_description:
      "Vous déconnecte automatiquement après une période d'inactivité. Utile sur les ordinateurs partagés ou si vous souhaitez une protection quand vous vous éloignez.",
    info_login_alerts_title: "Alertes de connexion",
    info_login_alerts_description:
      "Vous envoie un e-mail chaque fois que votre compte est connecté depuis un nouvel appareil ou lieu. Bon pour détecter rapidement les accès non autorisés.",
    info_external_link_warnings_title: "Avertissements de liens externes",
    info_external_link_warnings_description:
      "Affiche un avertissement avant d'ouvrir un lien qui sort d'Aster. Aide à repérer les tentatives d'hameçonnage avant de cliquer.",
    info_auto_discover_keys_title: "Découverte automatique des clés",
    info_auto_discover_keys_description:
      "Récupère automatiquement les clés de chiffrement de vos contacts pour envoyer des mails chiffrés sans configuration manuelle.",
    info_encrypt_by_default_title: "Chiffrer par défaut",
    info_encrypt_by_default_description:
      "Chiffre automatiquement les e-mails sortants quand la clé publique d'un destinataire est disponible. Pas besoin d'activer le chiffrement par message.",
    info_show_encryption_indicators_title: "Indicateurs de chiffrement",
    info_show_encryption_indicators_description:
      "Affiche une icône de cadenas sur les e-mails pour indiquer si un message est chiffré, signé ou ni l'un ni l'autre.",
    info_force_dark_mode_title: "Mode sombre pour les e-mails",
    info_force_dark_mode_description:
      "Réécrit les styles des e-mails pour utiliser un fond sombre et du texte clair. Utile si les e-mails blancs brillants sont pénibles pour vos yeux.",
    info_undo_send_title: "Annuler l'envoi",
    info_undo_send_description:
      "Vous donne une courte fenêtre pour annuler un e-mail après avoir cliqué sur envoyer. Rien ne part avant la fin du minuteur.",
    info_spam_sensitivity_title: "Sensibilité au spam",
    info_spam_sensitivity_description:
      "Élevée capte plus de spam mais peut signaler de vrais e-mails. Basse en laisse passer plus. Moyenne est le bon équilibre pour la plupart.",
    info_conversation_grouping_title: "Regroupement des conversations",
    info_conversation_grouping_description:
      "Regroupe les e-mails avec le même sujet en un fil. Facilite le suivi d'une conversation sans faire défiler des messages individuels.",
    one_click_unsubscribe_supported: "Désabonnement en un clic pris en charge",
    open_unsubscribe_page: "Ouvrir la page de désabonnement",
    font_size: "Taille de la police",
    vision: "Vision",
    color_vision: "Vision des couleurs",
    reading: "Lecture",
    motion_layout: "Animations et mise en page",
    high_contrast: "Contraste élevé",
    high_contrast_description:
      "Augmenter le contraste entre le texte et les arrière-plans",
    reduce_transparency: "Réduire la transparence",
    reduce_transparency_description:
      "Supprimer les effets de flou et augmenter l'opacité des superpositions",
    underline_links: "Souligner les liens",
    underline_links_description:
      "Toujours souligner les liens pour une identification plus facile",
    dyslexia_friendly_font: "Police adaptée à la dyslexie",
    dyslexia_friendly_font_description:
      "Utiliser OpenDyslexic, une police conçue pour la lisibilité",
    text_spacing: "Espacement du texte",
    text_spacing_description:
      "Augmenter la hauteur de ligne, l'espacement des lettres et des mots",
    reduce_motion: "Réduire les animations",
    reduce_motion_description: "Minimiser les animations et les transitions",
    compact_mode: "Mode compact",
    compact_mode_description:
      "Afficher plus de contenu avec moins d'espacement",
    enable_shortcuts_description:
      "Activer les raccourcis clavier dans toute l'application",
    font_size_small: "Petit",
    font_size_default: "Par défaut",
    font_size_large: "Grand",
    font_size_extra_large: "Très grand",
    colorblind_none: "Aucun",
    colorblind_deuteranopia: "Deutéranopie",
    colorblind_tritanopia: "Tritanopie",
    colorblind_achromatopsia: "Niveaux de gris",
    create_email_alias: "Créer un alias e-mail",
    email_aliases: "Alias e-mail",
    custom_domains_label: "Domaines personnalisés",
    standard_aliases: "Standard",
    create_alias: "Créer un alias",
    alias_address: "Adresse de l'alias",
    generate_random: "Générer aléatoirement",
    alias_copied: "Alias copié dans le presse-papiers",
    address_copied: "Adresse copiée dans le presse-papiers",
    set_as_primary: "Définir comme adresse principale",
    primary_badge: "Principale",
    primary_address_label: "Adresse principale",
    primary_address_set: "Adresse principale mise à jour",
    primary_address_reset: "Rétablir votre adresse par défaut",
    also_receives_at: "Reçoit aussi à {{email}}",
    alias_grace_days: "{{days}}j restants",
    domain_grace_days: "{{days}}j restants",
    domain_grace_upgrade_hint:
      "Effectuez une mise à niveau pour conserver ce domaine actif",
    alias_reserved: "Réservé",
    alias_grace_upgrade_hint:
      "Passez à un plan supérieur pour garder cet alias actif",
    alias_reserved_upgrade_hint:
      "Passez à un plan supérieur pour réactiver cet alias",
    invalid_address:
      "Cette adresse n'est pas valide. Vérifier le format suffit en général.",
    alias_already_taken:
      "Cet alias est déjà utilisé. Un autre devrait fonctionner.",
    alias_create_failed:
      "Cet alias ne s'est pas enregistré. Un autre essai devrait suffire. Vos autres alias sont inchangés.",
    alias_generate_failed:
      "Nous n'avons pas pu générer un alias tout de suite. Un autre essai devrait suffire.",
    alias_invalid:
      "Cet alias n'est pas valide. Les lettres, chiffres, points, traits de soulignement et tirets sont les caractères autorisés.",
    domain_not_available:
      "Ce domaine n'est pas disponible pour l'instant. Un autre devrait fonctionner.",
    failed_create_address:
      "Cette adresse ne s'est pas enregistrée. Un autre essai devrait suffire.",
    domain_limit_reached: "Limite de domaines atteinte",
    add_custom_domain: "Ajouter un domaine personnalisé",
    domain_name_label: "Nom de domaine",
    invalid_domain:
      "Ce domaine n'est pas valide. Vérifier le format suffit en général.",
    failed_add_domain:
      "Ce domaine n'a pas été ajouté. Un autre essai devrait suffire. Vos autres domaines sont inchangés.",
    configure_dns_for: "Configurer le DNS pour {{domain}}",
    dns_instruction_login:
      "Connectez-vous à votre registraire de domaine ou fournisseur DNS",
    dns_instruction_navigate: "Naviguez vers la gestion DNS de votre domaine",
    dns_instruction_add_txt:
      "Ajoutez un nouvel enregistrement TXT avec l'hôte et la valeur indiqués ci-dessous",
    dns_instruction_save_wait:
      "Enregistrez vos modifications et attendez la propagation",
    dns_instruction_add_mx:
      "Ajoutez un nouvel enregistrement MX dans vos paramètres DNS",
    dns_instruction_set_priority:
      "Définissez la priorité et le serveur de messagerie comme indiqué ci-dessous",
    dns_instruction_save: "Enregistrez vos modifications",
    dns_instruction_add_txt_settings:
      "Ajoutez un nouvel enregistrement TXT dans vos paramètres DNS",
    dns_instruction_set_spf:
      "Définissez la valeur sur l'enregistrement SPF indiqué ci-dessous",
    dns_instruction_merge_spf:
      "Si vous avez déjà un enregistrement SPF, ajoutez la directive include: à votre enregistrement existant",
    dns_instruction_set_dkim:
      "Définissez la valeur sur la clé DKIM indiquée ci-dessous",
    dns_instruction_set_dmarc_host:
      "Définissez l'hôte sur _dmarc (sans inclure votre domaine)",
    dns_instruction_set_dmarc_value:
      "Définissez la valeur sur la politique DMARC indiquée ci-dessous",
    edit_external_account: "Modifier le compte externe",
    add_external_account: "Ajouter un compte externe",
    edit_account: "Modifier le compte",
    save_account: "Enregistrer le compte",
    update_account_button: "Mettre à jour le compte",
    security_manual: "Manuel",
    security_auto: "Automatique",
    security_implicit: "Implicite",
    security_none: "Aucun",
    email_required: "Une adresse de courriel est nécessaire ici.",
    valid_email_required:
      "Cela ne ressemble pas à un courriel valide. Quelque chose comme nom@example.com fonctionnera.",
    incoming_server_required:
      "Le serveur de courrier entrant est nécessaire ici.",
    private_address_error:
      "Ceci doit être un serveur de courrier public, pas une adresse locale ou privée. Le nom d'hôte public que votre fournisseur vous a donné fonctionnera.",
    username_required: "Un nom d'utilisateur est nécessaire pour ce compte.",
    password_required: "Un mot de passe est nécessaire pour ce compte.",
    connection_timeout_error:
      "Un délai entre 5 et 120 secondes fonctionnera ici.",
    fill_server_first:
      "Le serveur, le nom d'utilisateur et le mot de passe sont nécessaires d'abord pour que la connexion puisse être testée.",
    fill_smtp_first:
      "Les détails du serveur sortant sont nécessaires d'abord pour qu'ils puissent être testés.",
    fill_connection_first:
      "Les détails de connexion sont nécessaires d'abord pour qu'ils puissent être testés.",
    connection_test_failed:
      "Le test de connexion n'est pas passé. Le serveur, le port et le mot de passe ci-dessous sont les éléments à vérifier. Votre connexion enregistrée est inchangée.",
    account_updated: "Compte mis à jour avec succès",
    account_added: "Compte ajouté avec succès",
    account_settings_not_saved:
      "Compte enregistré, mais ses paramètres de synchronisation et avancés n’ont pas été enregistrés",
    failed_update_account:
      "Ce compte ne s'est pas mis à jour. Un autre essai devrait suffire. Les paramètres précédents sont toujours actifs.",
    failed_add_account:
      "Ce compte n'a pas été ajouté. Un autre essai devrait suffire.",
    switch_failed:
      "Nous n'avons pas pu changer de compte. Un autre essai devrait suffire.",
    unexpected_error:
      "Quelque chose ne s'est pas passé comme prévu. Un autre essai devrait suffire.",
    failed_sync:
      "La synchronisation ne s'est pas terminée, et nous réessaierons automatiquement. Votre courrier des deux côtés est en sécurité.",
    failed_delete_emails_external:
      "Ces messages n'ont pas été retirés de votre compte lié. Un autre essai devrait suffire.",
    failed_fetch_folders_external:
      "Les dossiers de votre compte lié ne se sont pas chargés. Un autre essai devrait suffire.",
    show_password_toggle: "Afficher le mot de passe",
    hide_password_toggle: "Masquer le mot de passe",
    hide_smtp_password: "Masquer le mot de passe SMTP",
    show_smtp_password: "Afficher le mot de passe SMTP",
    please_enter_password: "Votre mot de passe est nécessaire pour continuer.",
    please_enter_2fa_code:
      "Le code actuel de votre application d'authentification est nécessaire ici.",
    invalid_2fa_code:
      "Ce code ne correspondait pas. Le code actuel de votre application d'authentification fonctionnera.",
    incorrect_password_error:
      "Ce mot de passe ne correspondait pas. Un autre essai devrait fonctionner. Votre compte n'est pas verrouillé.",
    failed_retrieve_auth:
      "Nous n'avons pas pu charger vos informations de connexion. Un autre essai devrait suffire.",
    failed_verify_password:
      "Ce mot de passe ne correspondait pas. Un autre essai devrait fonctionner.",
    failed_export_private_key:
      "Nous n'avons pas pu exporter votre clé tout de suite. Un autre essai devrait suffire. Votre clé est inchangée.",
    type_regenerate: "Tapez regenerate",
    client_side_encryption: "Chiffrement côté client",
    client_side_encryption_description:
      "Tout le chiffrement se fait dans votre navigateur avant que les données ne quittent votre appareil",
    zero_knowledge_storage: "Stockage à connaissance nulle",
    zero_knowledge_storage_description:
      "Nous ne pouvons pas lire vos données. Seul vous détenez les clés.",
    email_content_attachments: "Contenu des e-mails et pièces jointes",
    folder_names_structure: "Noms et structure des dossiers",
    drafts_signatures: "Brouillons et signatures",
    contact_information_label: "Informations de contact",
    auto_discover_keys_description:
      "Rechercher automatiquement sur WKD et les serveurs de clés lors de la rédaction",
    key_published_wkd: "Clé publiée sur WKD",
    key_removed_wkd: "Clé retirée de WKD",
    failed_publish_wkd:
      "Votre clé publique ne s'est pas publiée dans l'annuaire public. Un autre essai devrait suffire. Vos clés sont inchangées.",
    failed_remove_wkd:
      "Votre clé n'a pas été retirée de l'annuaire public. Un autre essai devrait suffire.",
    key_published_keyserver: "Clé publiée sur le serveur de clés",
    failed_publish_keyserver:
      "Votre clé publique ne s'est pas publiée sur le serveur de clés. Un autre essai devrait suffire.",
    mailto_unregister_manual:
      "Pour empêcher Aster Mail d'ouvrir les liens mailto, supprimez le gestionnaire dans les réglages de votre navigateur.",
    failed_save_setting:
      "Impossible d'enregistrer le paramètre. Veuillez réessayer.",
    keys_cannot_remove_keyservers:
      "Une fois qu'une clé est sur un serveur de clés public, elle ne peut pas être retirée. À bien réfléchir avant de publier.",
    copied_to_clipboard: "Copié dans le presse-papiers",
    category_storage_limits: "Stockage et limites",
    category_email_features: "Fonctionnalités e-mail",
    category_organization: "Organisation",
    category_security_plans: "Sécurité",
    category_privacy: "Confidentialité",
    category_import_export: "Import et export",
    category_support: "Assistance",
    category_apps_integrations: "Applications et intégrations",
    feature_secure_storage: "Stockage sécurisé",
    feature_max_attachment: "Taille maximale des pièces jointes",
    feature_daily_send_limit: "Limite d'envoi quotidienne",
    feature_email_retention: "Conservation des e-mails",
    feature_e2e_encryption: "Chiffrement de bout en bout",
    feature_zero_knowledge: "Architecture à connaissance nulle",
    feature_email_aliases: "Alias e-mail",
    feature_custom_domains: "Domaines personnalisés",
    feature_scheduled_sending: "Envoi programmé",
    feature_undo_send: "Annuler l'envoi",
    feature_read_receipts: "Accusés de réception",
    feature_email_templates: "Modèles d'e-mail",
    feature_auto_responder: "Réponse automatique",
    feature_smart_folders: "Dossiers intelligents",
    feature_advanced_search: "Recherche avancée",
    feature_contacts: "Contacts",
    feature_contact_groups: "Groupes de contacts",
    feature_two_factor: "Authentification à deux facteurs",
    feature_recovery_codes: "Codes de récupération",
    feature_password_folders: "Dossiers protégés par mot de passe",
    feature_session_management: "Gestion des sessions",
    feature_login_notifications: "Notifications de connexion",
    feature_encrypted_exports: "Exports chiffrés",
    feature_hardware_key: "Support des clés matérielles",
    feature_no_ads: "Pas de publicité",
    feature_no_tracking: "Pas de suivi",
    feature_anonymous_signup: "Inscription anonyme",
    feature_tor_support: "Support Tor",
    feature_link_tracking: "Protection contre le suivi des liens",
    feature_remote_image_blocking: "Blocage des images distantes",
    feature_import_gmail: "Importer depuis Gmail",
    feature_import_outlook: "Importer depuis Outlook",
    feature_export_emails: "Exporter les e-mails",
    feature_export_contacts: "Exporter les contacts",
    feature_help_center: "Accès au centre d'aide",
    feature_community_forum: "Forum communautaire",
    feature_email_support: "Support par e-mail",
    feature_priority_support: "Support prioritaire",
    feature_response_time: "Temps de réponse",
    feature_web_app: "Application web",
    feature_android_app: "Application Android",
    feature_desktop_app: "Application de bureau",
    feature_browser_extension: "Extension de navigateur",
    feature_caldav: "Calendrier CalDAV",
    feature_labels: "Libellés",
    feature_mbox_import: "Import MBOX",
    feature_two_factor_auth: "Authentification à deux facteurs",
    feature_password_protected_folders: "Dossiers protégés par mot de passe",
    feature_link_tracking_protection: "Protection contre le suivi des liens",
    feature_ios_app: "Application iOS",
    feature_imap_smtp: "Accès IMAP/SMTP",
    feature_caldav_calendar: "Calendrier CalDAV",
    feature_api_access: "Accès API",
    feature_100_emails: "100 e-mails",
    feature_200_emails: "200 e-mails",
    feature_500_emails: "500 e-mails",
    feature_10_seconds: "10 secondes",
    feature_30_seconds: "30 secondes",
    feature_60_seconds: "60 secondes",
    feature_30_days: "30 jours",
    feature_1_year: "1 an",
    feature_48_hours: "48 heures",
    feature_24_hours: "24 heures",
    plan_personal: "Personnel",
    plan_starter: "Starter",
    plan_pro: "Pro",
    plan_free: "Gratuit",
    per_month: "/mois",
    for_life: "à vie",
    back_to_plans: "Retour aux forfaits",
    compare_all_features: "Comparer toutes les fonctionnalités",
    continue_with_plan: "Continuer avec {{plan}}",
    select_your_plan: "Sélectionnez votre forfait",
    plan_features: "Fonctionnalités de {{plan}}",
    all_plans_include_privacy:
      "Tous les forfaits incluent nos fonctionnalités de base en matière de confidentialité et de sécurité.",
    upgrade_downgrade_anytime:
      "Mettez à niveau ou rétrogradez à tout moment depuis vos paramètres.",
    features: "Fonctionnalités",
    protect_folder: "Protéger le dossier",
    unlock_folder: "Déverrouiller le dossier",
    change_folder_password: "Changer le mot de passe",
    remove_folder_password: "Supprimer le mot de passe",
    folder_password: "Mot de passe du dossier",
    set_password: "Définir le mot de passe",
    unlock_button: "Déverrouiller",
    update_password_button: "Mettre à jour le mot de passe",
    remove_protection: "Supprimer la protection",
    submit: "Soumettre",
    enter_strong_password: "Saisir un mot de passe fort",
    re_enter_password: "Ressaisir votre mot de passe",
    keep_saved_password:
      "Laissez vide pour conserver le mot de passe enregistré",
    enter_your_password: "Saisir votre mot de passe",
    enter_current_password_folder: "Saisir le mot de passe actuel",
    enter_new_password_folder: "Saisir le nouveau mot de passe",
    re_enter_new_password: "Ressaisir le nouveau mot de passe",
    enter_password_to_confirm: "Saisir votre mot de passe pour confirmer",
    password_min_8: "Au moins 8 caractères fonctionneront ici.",
    passwords_do_not_match_folder:
      "Les deux mots de passe ne correspondent pas. Les saisir à nouveau devrait régler la chose.",
    choose_stronger_password:
      "Ce mot de passe est facile à deviner. Quelque chose de plus long ou plus varié tiendra mieux.",
    enter_password_required:
      "Votre mot de passe est nécessaire pour continuer.",
    enter_current_password_required:
      "Veuillez saisir votre mot de passe actuel",
    new_password_min_8: "Au moins 8 caractères fonctionneront ici.",
    new_passwords_do_not_match:
      "Les deux mots de passe ne correspondent pas. Les saisir à nouveau devrait régler la chose.",
    choose_stronger_new_password:
      "Ce mot de passe est facile à deviner. Quelque chose de plus long ou plus varié tiendra mieux.",
    enter_password_confirm_required:
      "Votre mot de passe est nécessaire pour continuer.",
    no_password_recovery_title: "Ce mot de passe ne peut pas être récupéré.",
    no_password_recovery_desc:
      "Si vous oubliez ce mot de passe, personne ne peut récupérer ce dossier pour vous. L'enregistrer quelque part où vous ne le perdrez pas compte.",
    folder_protected_desc:
      "Ce dossier est protégé. Saisissez votre mot de passe pour accéder à son contenu.",
    remove_protection_warning_title: "Retirer le mot de passe de ce dossier",
    remove_protection_warning_desc:
      "Après cela, toute personne connectée à votre compte pourra lire ce dossier sans mot de passe séparé. Veiller à ce que votre compte lui-même soit bien protégé compte d'autant plus une fois ceci désactivé.",
    password_strength_label: "Force du mot de passe",
    all_emails_conversations: "Tous les e-mails et conversations",
    drafts_templates: "Brouillons et modèles",
    custom_folders_labels: "Dossiers et libellés personnalisés",
    contacts_address_book: "Contacts et carnet d'adresses",
    account_preferences_settings: "Préférences et paramètres du compte",
    encryption_keys_security: "Clés de chiffrement et données de sécurité",
    delete_confirmation_word: "DELETE",
    type_delete_placeholder: "Tapez {word} ici",
    enter_your_password_placeholder: "Saisir votre mot de passe",
    macos: "macOS",
    windows_linux: "Windows/Linux",
    font_size_description:
      "Ajuster la taille de base du texte dans l'interface",
    font_size_reset: "Réinitialiser",
    vision_description:
      "Paramètres pour une meilleure visibilité et un meilleur contraste",
    color_vision_description:
      "Appliquer des filtres de couleur pour adapter l'interface aux déficiences de la vision des couleurs",
    reading_description:
      "Ajuster la police et l'espacement pour faciliter la lecture",
    motion_layout_description:
      "Contrôler les animations et la densité de l'interface",
    keyboard_shortcuts_description:
      "Utiliser les raccourcis clavier pour les actions courantes",
    manage_encryption_description:
      "Gérer vos clés de chiffrement et la récupération de compte",
    password_required_title: "Mot de passe requis",
    enter_password_view_settings:
      "Saisissez votre mot de passe pour voir les paramètres de chiffrement",
    created_date: "Créée le {{date}}",
    export_public_key_label: "Exporter la clé publique",
    export_private_key_label: "Exporter la clé privée",
    verify_identity_export:
      "Vérifiez votre identité pour exporter votre clé privée",
    two_fa_code_label: "Code 2FA",
    codes_remaining_count: "{{remaining}} sur {{total}} restants",
    codes_used_count: "{{used}} utilisés",
    running_low_warning:
      "Vos codes de récupération diminuent. Générer un nouvel ensemble et le garder dans un endroit sûr vous gardera couvert.",
    download_pdf: "Télécharger le PDF",
    regenerate_codes_label: "Régénérer les codes",
    regenerate_codes_warning:
      "Vos codes de récupération actuels cesseront de fonctionner dès que vous en générerez de nouveaux. Enregistrer le nouvel ensemble dans un endroit sûr avant de fermer cette fenêtre vous garde couvert. Tapez",
    end_to_end_encrypted: "Chiffré de bout en bout",
    all_data_protected:
      "Toutes vos données sont protégées par un chiffrement à connaissance nulle",
    pgp_compatible: "Compatible PGP",
    pgp_compatible_description:
      "Envoyez des e-mails chiffrés à quiconque utilisant PGP.",
    emails_decrypted: "E-mails déchiffrés",
    last_decryption: "Dernier déchiffrement",
    encryption_behavior: "Comportement du chiffrement",
    control_encryption_description:
      "Contrôler comment le chiffrement est appliqué à vos e-mails",
    encryption_title: "Chiffrement",
    alias_limit_all_used:
      "Vous avez utilisé {{used}} de vos {{count}} alias du forfait actuel.",
    alias_forwards_description:
      "Créer une nouvelle adresse qui redirige vers votre boîte de réception.",
    address_label: "Adresse",
    display_name_sender_note:
      "Affiché comme nom d'expéditeur lorsque vous répondez depuis cet alias.",
    aliases_description:
      "Créez des adresses e-mail alternatives qui redirigent vers votre boîte de réception principale. Utilisez-les pour protéger votre vie privée ou organiser le courrier entrant.",
    twin_address_title: "Votre adresse jumelle",
    twin_address_reserved_description:
      "{{ address }} est réservée à votre compte, donc personne d'autre ne peut l'enregistrer. Créez-la comme alias quand vous voulez envoyer et recevoir avec elle.",
    twin_address_available_description:
      "{{ address }} est l'adresse correspondante sur l'autre domaine Aster. Créez-la comme alias pour envoyer et recevoir avec elle.",
    twin_address_create: "Créer un alias",
    custom_domain_addresses_note:
      "Vous pouvez également créer des adresses sur vos domaines personnalisés vérifiés.",
    alias_taken_try_different:
      "Cet alias est déjà pris. Essayez un nom différent.",
    upgrade_plan_more_aliases:
      "Mettez à niveau votre forfait pour créer plus d'alias et débloquer des fonctionnalités supplémentaires.",
    upgrade_plan_more_domains:
      "Mettez à niveau votre forfait pour ajouter plus de domaines et débloquer des fonctionnalités supplémentaires.",
    custom_domains_not_available: "Domaines personnalisés non disponibles",
    no_aliases_yet:
      "Aucun alias supplémentaire pour le moment. Créez-en un pour protéger votre vie privée.",
    no_domains_yet: "Aucun domaine personnalisé pour le moment",
    add_first_domain:
      "Ajoutez votre premier domaine personnalisé pour commencer",
    continue_setup: "Continuer la configuration",
    verified_count: "{{count}}/5 vérifiés",
    used_count: "{{current}} / {{max}} utilisés",
    dns_records_for_domain: "Enregistrements DNS pour ce domaine :",
    add_dns_records_description:
      "Ajoutez ces enregistrements DNS à votre registraire de domaine pour vérifier la propriété et activer l'e-mail :",
    domains_description:
      "Ajoutez votre propre domaine pour créer des adresses et envoyer des e-mails depuis votre domaine. Les domaines vérifiés apparaissent dans le sélecteur de domaine d'alias.",
    domains_page_description:
      "Utilisez votre propre domaine avec Aster Mail. Ajoutez un domaine que vous possédez déjà, ou achetez-en un nouveau et Aster Mail configure le DNS pour vous. Les domaines vérifiés apparaissent dans le sélecteur de domaine d'alias.",
    add_or_buy_domain: "Ajouter ou acheter un domaine",
    add_domain_you_own: "Ajouter un domaine que vous possédez",
    buy_new_domain: "Acheter un nouveau domaine",
    search_domains_placeholder: "Rechercher dans vos domaines",
    no_matching_domains: "Aucun domaine ne correspond à votre recherche.",
    domains_send_receive_description:
      "Ajoutez votre propre domaine pour envoyer et recevoir des e-mails. Vous aurez besoin d'accéder aux paramètres DNS de votre domaine pour compléter la vérification.",
    verification_failed_retry: "Échec de la vérification. Veuillez réessayer.",
    dns_propagation_close_note:
      "Les modifications DNS peuvent prendre jusqu'à 48 heures pour se propager. Vous pouvez fermer cet assistant et vérifier plus tard.",
    configure_dns_description:
      "Suivez chaque étape pour configurer votre domaine. Aster vérifie les enregistrements directement via DNS.",
    domain_input_description:
      "Saisissez votre nom de domaine. Vous serez guidé dans la configuration DNS après l'ajout.",
    domain_limit_all_used:
      "Vous avez utilisé tous les {{count}} domaines de votre forfait actuel.",
    domain_without_www_note: "Saisissez votre domaine sans www ni https://",
    catch_all_label: "Fourre-tout",
    catch_all_description:
      "Recevoir les e-mails envoyés à n'importe quelle adresse de ce domaine",
    set_host_root:
      "Définissez l'hôte sur @ (n'entrez pas votre domaine ; votre fournisseur l'ajoute automatiquement)",
    use_exact_host:
      "Utilisez l'hôte/nom exact indiqué ci-dessous (inclut le préfixe du sélecteur)",
    verification_description:
      "Prouvez que vous possédez ce domaine en ajoutant un enregistrement TXT. Ceci est requis avant que tout autre enregistrement ne soit vérifié.",
    mx_description:
      "Acheminer les e-mails entrants vers les serveurs de messagerie d'Aster. Sans cet enregistrement, vous ne pouvez pas recevoir d'e-mails sur votre domaine personnalisé.",
    spf_description:
      "Autoriser Aster à envoyer des e-mails au nom de votre domaine. Cela empêche vos e-mails d'être marqués comme spam.",
    dkim_description:
      "Ajouter une signature cryptographique pour vérifier que les e-mails envoyés depuis votre domaine sont authentiques et n'ont pas été falsifiés.",
    dmarc_description:
      "Définir comment les serveurs de réception doivent traiter les e-mails qui échouent aux vérifications SPF ou DKIM. Cela protège votre domaine contre l'usurpation d'identité.",
    verification_help:
      'La plupart des registraires ont une section DNS ou Éditeur de zone. Cherchez des options comme "Ajouter un enregistrement" ou "Gérer le DNS". Sélectionnez TXT comme type d\'enregistrement.',
    mx_help:
      "Les enregistrements MX indiquent aux autres serveurs de messagerie où livrer les e-mails pour votre domaine. Le numéro de priorité détermine l'ordre dans lequel les serveurs sont essayés (plus bas = en premier).",
    spf_help:
      "Les enregistrements SPF sont des enregistrements TXT qui spécifient quels serveurs de messagerie sont autorisés à envoyer des e-mails pour votre domaine. Un seul enregistrement SPF doit exister par domaine.",
    dkim_help:
      "DKIM utilise des signatures cryptographiques Ed25519. Chaque e-mail envoyé via Aster sera signé avec une clé privée, et les serveurs de réception vérifient la signature en utilisant cette clé publique dans votre DNS.",
    dmarc_help:
      'DMARC s\'appuie sur SPF et DKIM pour vous donner le contrôle sur la façon dont les e-mails non authentifiés sont traités. La politique "quarantine" indique aux destinataires de signaler les e-mails suspects comme spam.',
    host_required: "L'hôte {{label}} est obligatoire",
    host_invalid_characters:
      "Le serveur {{label}} contient des caractères que nous ne pouvons pas utiliser. Le nom d'hôte seul, comme mail.example.com, fonctionnera.",
    host_private_address:
      "Ceci doit être un serveur de courrier public, pas une adresse locale ou privée. Le nom d'hôte public que votre fournisseur vous a donné fonctionnera.",
    incoming_server_invalid:
      "Ce n'est pas une adresse de serveur valide. Le nom d'hôte seul, comme imap.example.com, fonctionnera.",
    incoming_port_error: "Un numéro de port entre 1 et 65535 fonctionnera ici.",
    incoming_mail_server: "Serveur de courrier entrant",
    smtp_server: "Serveur SMTP",
    smtp_server_required: "L'hôte du serveur SMTP est obligatoire",
    smtp_server_invalid:
      "Ce n'est pas un serveur sortant valide. Le nom d'hôte seul, comme smtp.example.com, fonctionnera.",
    smtp_private_address_error:
      "Ceci doit être un serveur de courrier public, pas une adresse locale ou privée. Le nom d'hôte public que votre fournisseur vous a donné fonctionnera.",
    smtp_port_error: "Un numéro de port entre 1 et 65535 fonctionnera ici.",
    smtp_username_required: "Le nom d'utilisateur SMTP est obligatoire",
    smtp_password_required: "Le mot de passe SMTP est obligatoire",
    label_color_invalid:
      "Cette couleur n'est pas un choix valide. Une couleur de la palette fonctionnera.",
    smtp_test_failed:
      "Le test du serveur sortant n'est pas passé. Le serveur, le port et le mot de passe ci-dessous sont les éléments à vérifier.",
    deleted_emails_count: "{{count}} e-mail(s) supprimé(s)",
    edit_external_account_description:
      "Mettez à jour les paramètres de votre compte externe. Ressaisissez les identifiants pour les mettre à jour.",
    add_external_account_description:
      "Connectez un compte externe POP3 ou IMAP pour importer des e-mails.",
    account_info: "Informations du compte",
    incoming_mail: "Courrier entrant",
    protocol: "Protocole",
    server_host: "Hôte du serveur",
    port: "Port",
    username: "Nom d'utilisateur",
    use_tls: "Utiliser TLS",
    outgoing_mail_smtp: "Courrier sortant (SMTP)",
    same_as_incoming: "Identique au courrier entrant",
    smtp_server_host: "Hôte du serveur SMTP",
    smtp_username: "Nom d'utilisateur SMTP",
    smtp_password: "Mot de passe SMTP",
    label: "Libellé",
    label_name: "Nom du libellé",
    label_color: "Couleur du libellé",
    label_name_placeholder: "ex. Gmail Travail",
    sync_settings: "Paramètres de synchronisation",
    sync_frequency: "Fréquence de synchronisation",
    imap_folders: "Dossiers IMAP",
    fetch_folders: "Récupérer les dossiers",
    msgs: "msg",
    new: "nouveau",
    showing_folders: "Affichage de {{shown}} sur {{total}} dossiers",
    no_folders_found: "Aucun dossier trouvé.",
    advanced_settings: "Paramètres avancés",
    tls_method: "Méthode TLS",
    connection_timeout: "Délai de connexion (secondes)",
    archive_sent_label:
      "Copier les e-mails envoyés dans le dossier Envoyés du serveur distant",
    delete_after_fetch_label:
      "Supprimer les e-mails du serveur distant après importation",
    test_connection: "Tester la connexion",
    test_smtp: "Tester SMTP",
    syncing: "Synchronisation...",
    syncing_progress: "Synchronisation ({{processed}}/{{total}})",
    fetching_emails: "Récupération des e-mails...",
    sync_failed:
      "La synchronisation ne s'est pas terminée, et nous réessaierons automatiquement. Votre courrier de chaque côté est en sécurité.",
    not_synced: "Non synchronisé",
    sync_failed_detail:
      "La dernière synchronisation à {{time}} ne s'est pas terminée. Un autre essai, ou une vérification de votre mot de passe de compte, suffit en général.",
    external_accounts: "Comptes externes",
    external_accounts_description:
      "Connectez des comptes e-mail externes pour importer et envoyer des e-mails depuis d'autres fournisseurs.",
    add_account: "Ajouter un compte",
    remove_account: "Supprimer le compte",
    no_external_accounts: "Aucun compte externe",
    no_external_accounts_description:
      "Connectez un compte e-mail externe pour importer et envoyer des e-mails depuis d'autres fournisseurs",
    external_account_count: "{{count}} compte(s) externe(s)",
    email_count: "{{count}} e-mail(s)",
    purge_confirm_message:
      "Cela supprimera définitivement tous les {{count}} e-mail(s) importés depuis {{email}}. Cette action est irréversible.",
    this_account: "ce compte",
    storage_limit_reached: "Limite de stockage atteinte",
    auto_forward_title: "Transfert automatique",
    forwarding_pending_verification: "Vérification en attente",
    resend_verification_email: "Renvoyer l'e-mail de vérification",
    forwarding_awaiting_verification:
      "En attente de confirmation de {{ addresses }}. Aucun message n'y est encore transféré.",
    forwarding_verification_sent:
      "E-mail de vérification envoyé à {{ address }}. Le transfert démarrera après confirmation.",
    forwarding_internal_active:
      "Le transfert est actif. Les destinations Aster vers Aster ne nécessitent aucune vérification.",
    forwarding_verification_resent:
      "E-mail de vérification renvoyé à {{ address }}",
    forwarding_confirmed_success:
      "Destination vérifiée. Le transfert est maintenant actif.",
    forwarding_confirmed_failed:
      "Ce lien de vérification est invalide ou expiré. Envoyez-en un nouveau depuis la règle.",
    auto_forward_description:
      "Transférer automatiquement les e-mails entrants vers d'autres adresses selon des conditions. Les règles de transfert évaluent les en-têtes des e-mails (expéditeur, destinataire, objet) sans accéder au contenu des e-mails.",
    add_rule: "Ajouter une règle",
    edit_forwarding_rule: "Modifier la règle de transfert",
    create_forwarding_rule: "Créer une règle de transfert",
    no_forwarding_rules: "Aucune règle de transfert",
    create_rule_description:
      "Créez une règle pour transférer automatiquement vos e-mails vers d'autres adresses",
    try_different_search: "Essayez un terme de recherche différent",
    allowlist_title: "Liste autorisée",
    allowlist_description:
      "Les e-mails des expéditeurs autorisés ne sont jamais marqués comme indésirables.",
    add_to_allowlist: "Ajouter à la liste autorisée",
    entire_domain: "Domaine entier",
    unreadable_entry_title: "Entrée illisible",
    unreadable_entry_hint:
      "Cet appareil ne peut pas lire cette entrée. Elle reste active tant que vous ne la supprimez pas.",
    unreadable_entries_notice:
      "Certaines entrées ne peuvent pas être lues sur cet appareil et ne sont donc pas affichées ici.",
    external_accounts_limit_reached:
      "Vous pouvez connecter jusqu'à 5 comptes. Pour en ajouter un autre, supprimez-en un d'abord.",
    no_allowed_senders: "Aucun expéditeur autorisé",
    add_senders_allowlist_hint:
      "Ajoutez des expéditeurs ou des domaines pour que leurs e-mails arrivent toujours dans votre boîte de réception",
    allowed_senders_count: "{{count}} expéditeur(s) autorisé(s)",
    added_on_date: "Ajouté le {{date}}",
    enter_domain_placeholder: "Saisir un domaine (ex. : entreprise.com)",
    enter_email_placeholder: "Saisir une adresse e-mail...",
    remove_count: "Supprimer ({{count}})",
    select_import_source: "Sélectionner la source de vos e-mails",
    back_to_providers: "← Retour aux fournisseurs",
    drop_files_here: "Déposez les fichiers ici",
    drag_drop_files: "Glissez et déposez vos fichiers ici",
    supported_import_formats:
      "Prend en charge les fichiers MBOX, EML, CSV et PST",
    browse_files: "Parcourir les fichiers",
    importing_emails_progress: "Importation des e-mails en cours...",
    emails_of_total: "{{current}} sur {{total}} e-mails",
    cancel_import: "Annuler l'importation",
    emails_imported_count: "{{count}} e-mails importés",
    duplicates_skipped: "{{count}} doublons ignorés",
    import_folder_hint:
      "Vous ne trouvez pas certains e-mails ? Vérifiez vos dossiers Spam et Envoyés - les e-mails importés peuvent y être classés.",
    n_failed_count: "{{count}} échec",
    import_folders_skipped:
      "{{count}} dossier n'a pas pu être créé, donc ses messages sont dans votre boîte de réception.",
    import_folders_skipped_plural:
      "{{count}} dossiers n'ont pas pu être créés, donc leurs messages sont dans votre boîte de réception.",
    storage_quota_reached:
      "Votre stockage est plein. Mettre à niveau votre plan, ou retirer quelques messages, fera de la place pour plus d'imports.",
    no_emails_in_file:
      "Aucun e-mail trouvé dans les fichiers sélectionnés. Vérifiez que chaque fichier est dans un format pris en charge (MBOX, EML, CSV ou PST).",
    import_failed:
      "L'import ne s'est pas terminé. Un autre essai devrait suffire. Vos données existantes sont inchangées.",
    failed_to_parse_file:
      "Ce fichier n'a pas pu être lu. Un autre fonctionnera.",
    plan_storage_value: "{{value}} de stockage",
    plan_aliases_count: "{{count}} alias",
    plan_domains_count: "{{count}} domaine(s)",
    forwarding_rules_count: "{{count}} règle(s) de transfert",
    keeps_copy: "Conserve une copie",
    vacation_reply_title: "Réponse automatique",
    vacation_reply_description:
      "Configurez une réponse automatique pour les e-mails entrants lorsque vous êtes absent. Utilise uniquement les métadonnées expéditeur/destinataire, n'accède pas au contenu de l'e-mail.",
    vacation_reply_subject: "Objet",
    vacation_reply_body: "Message",
    vacation_reply_start_date: "Date de début",
    vacation_reply_end_date: "Date de fin",
    vacation_reply_external_only:
      "Répondre uniquement aux expéditeurs externes",
    vacation_reply_enabled: "Réponse automatique active",
    vacation_reply_disabled: "Réponse automatique en pause",
    vacation_reply_save: "Enregistrer",
    vacation_reply_delete: "Supprimer",
    vacation_reply_delete_title: "Supprimer la réponse d’absence ?",
    vacation_reply_delete_message:
      "Votre réponse d’absence et sa planification sont supprimées.",
    delete_forwarding_rule_title: "Supprimer la règle de transfert ?",
    delete_forwarding_rule_message:
      "Les messages correspondant à cette règle ne sont plus transférés.",
    vacation_reply_empty: "Aucune réponse automatique configurée",
    vacation_reply_saved: "Réponse automatique enregistrée",
    vacation_reply_deleted: "Réponse automatique supprimée",
    vacation_reply_toggled_on: "Réponse automatique activée",
    vacation_reply_toggled_off: "Réponse automatique désactivée",
    blocked_senders_title: "Expéditeurs bloqués",
    blocked_senders_description:
      "Les e-mails des expéditeurs bloqués sont automatiquement filtrés de votre boîte de réception.",
    no_blocked_senders: "Aucun expéditeur bloqué",
    block_senders_hint:
      "Bloquez des expéditeurs depuis le menu de profil pour filtrer leurs e-mails de votre boîte de réception",
    blocked_senders_count: "{{count}} expéditeur(s) bloqué(s)",
    blocked_date: "Bloqué le {{date}}",
    snooze_description:
      "Mettez en veille les abonnements indésirables. Les expéditeurs mis en veille sont filtrés automatiquement de votre boîte de réception.",
    active_count: "Actifs ({{count}})",
    snoozed_count: "En veille ({{count}})",
    snooze_count: "Mise en veille ({{count}})",
    scan_inbox: "Analyser la boîte de réception",
    scanning_progress: "Analyse ({{processed}}/{{total}})",
    no_snoozed_senders: "Aucun expéditeur en veille",
    no_subscriptions_detected: "Aucun abonnement détecté",
    snoozed_appear_here:
      "Les expéditeurs que vous mettez en veille apparaîtront ici",
    scan_inbox_description:
      "Cliquez sur 'Analyser la boîte de réception' pour détecter les newsletters et e-mails marketing",
    emails_count: "{{count}} e-mails",
    newsletter: "Infolettre",
    social: "Réseaux sociaux",
    transactional: "Transactionnel",
    other: "Autre",
    email_signature_title: "Signature d'e-mail",
    email_signature_description:
      "Créez et gérez vos signatures d'e-mail. Toutes les signatures sont chiffrées de bout en bout.",
    signature_mode: "Mode de signature",
    signature_off: "Désactivé",
    signature_auto: "Automatique",
    signature_manual: "Manuel",
    signature_off_description:
      "Les signatures ne seront pas ajoutées à vos e-mails.",
    signature_auto_description:
      "Votre signature par défaut sera automatiquement ajoutée aux nouveaux e-mails.",
    signature_manual_description:
      "Vous pouvez insérer manuellement une signature lors de la rédaction d'e-mails.",
    your_signatures: "Vos signatures ({{count}})",
    add_signature: "Ajouter une signature",
    signature_name: "Nom de la signature",
    signature_name_placeholder: "ex. Travail, Personnel, Formel",
    signature_content: "Contenu de la signature",
    signature_content_placeholder: "Cordialement,\nVotre Nom\nvotre@email.com",
    signature_name_required: "Saisissez un nom pour cette signature.",
    signature_content_required: "Ajoutez du contenu à cette signature.",
    signature_image_too_large: "Les images doivent faire moins de 2 Mo.",
    signature_image_invalid:
      "Seules les images PNG, JPEG, GIF et WebP peuvent être ajoutées.",
    signature_image_failed:
      "Cette image n'a pas pu être ajoutée. Un autre fichier devrait fonctionner.",
    signature_divider_limit:
      "Une signature peut contenir jusqu'à {{count}} séparateurs.",
    plain_text_hint:
      "Texte brut uniquement. Utilisez des retours à la ligne pour la mise en forme.",
    update_signature: "Mettre à jour la signature",
    create_signature: "Créer une signature",
    no_signatures_yet: "Aucune signature pour le moment",
    no_signatures_description:
      "Créez votre première signature pour personnaliser vos e-mails.",
    default_badge: "Par défaut",
    signature_placement: "Emplacement de la signature",
    signature_placement_description:
      "Choisir où votre signature apparaît dans les réponses",
    below_quoted_text: "Sous le texte cité",
    below_quoted_description: "La signature apparaît après le message cité",
    above_quoted_text: "Au-dessus du texte cité",
    above_quoted_description: "La signature apparaît avant le message cité",
    email_templates_title: "Modèles d'e-mail",
    email_templates_description:
      "Créez et gérez des modèles d'e-mail réutilisables. Tous les modèles sont chiffrés de bout en bout.",
    your_templates: "Vos modèles ({{count}})",
    add_template: "Ajouter un modèle",
    template_name: "Nom du modèle",
    template_name_placeholder: "ex. Demande de réunion",
    category: "Catégorie",
    category_placeholder: "ex. Travail, Personnel",
    template_content: "Contenu du modèle",
    template_content_placeholder:
      "Bonjour [Nom],\n\nJe souhaiterais planifier une réunion...\n\nCordialement",
    placeholders_hint:
      "Utilisez des espaces réservés comme [Nom], [Date], etc. pour personnaliser lors de l'utilisation.",
    update_template: "Mettre à jour le modèle",
    create_template: "Créer un modèle",
    no_templates_yet: "Aucun modèle pour le moment",
    no_templates_description:
      "Créez votre premier modèle pour accélérer la rédaction d'e-mails.",
    spam_filtering_title: "Filtrage anti-spam",
    spam_filtering_description:
      "Configurer la détection et la gestion du spam.",
    spam_sensitivity: "Sensibilité anti-spam",
    auto_delete_spam_after: "Supprimer automatiquement le spam après",
    spam_delete_hint:
      "Les e-mails indésirables plus anciens que cette période seront définitivement supprimés",
    save_changes: "Enregistrer les modifications",
    spam_low: "Faible",
    spam_low_description: "Seul le spam évident est filtré",
    spam_medium: "Moyen",
    spam_medium_description: "Filtrage équilibré",
    spam_high: "Élevé",
    spam_high_description:
      "Filtrage agressif, peut intercepter certains e-mails légitimes",
    retention_7_days: "7 jours",
    retention_14_days: "14 jours",
    retention_30_days: "30 jours",
    retention_60_days: "60 jours",
    retention_90_days: "90 jours",
    retention_never: "Jamais (conserver indéfiniment)",
    import_emails_title: "Importer des e-mails",
    import_add_another: "Ajouter un autre compte",
    import_choose_source: "Choisissez une source",
    import_emails_description:
      "Importez vos e-mails depuis Gmail, Outlook ou d'autres services de messagerie. Vos e-mails sont chiffrés sur votre appareil avant d'être stockés.",
    import_emails_button: "Importer des e-mails",
    recent_imports: "Importations récentes",
    status_pending: "En attente",
    status_in_progress: "En cours",
    status_completed: "Terminé",
    status_failed: "Échec",
    status_cancelled: "Annulé",
    just_now: "À l'instant",
    source_import: "Import {{source}}",
    imported_skipped: "{{imported}} importés{{skipped}}",
    export_import_settings_title: "Exporter et importer les paramètres",
    export_import_settings_description:
      "Sauvegardez vos paramètres ou transférez-les vers un autre compte",
    export_settings: "Exporter les paramètres",
    import_settings_button: "Importer les paramètres",
    invalid_settings_format:
      "Ce fichier ne correspond pas au format de paramètres attendu. Un autre export fonctionnera. Vos paramètres actuels sont inchangés.",
    settings_imported: "Paramètres importés avec succès",
    rule_name_optional: "Nom de la règle (optionnel)",
    rule_name_placeholder:
      "ex. E-mails professionnels, Sauvegarde newsletters...",
    conditions: "Conditions",
    value_placeholder: "Valeur...",
    add_condition: "Ajouter une condition",
    and_logic_hint:
      "Les conditions multiples utilisent la logique ET, toutes doivent correspondre",
    forward_to: "Transférer vers",
    email_address_input_placeholder: "Saisir l'adresse e-mail...",
    add_another_address: "Ajouter une autre adresse",
    keep_copy_inbox: "Garder une copie dans ma boîte de réception",
    save_rule: "Enregistrer la règle",
    all_emails_option: "Tous les e-mails",
    from_option: "De",
    to_option: "À",
    subject_option: "Objet",
    contains_option: "contient",
    equals_option: "est égal à",
    starts_with_option: "commence par",
    ends_with_option: "se termine par",
    matches_regex_option: "correspond à l'expression régulière",
    account_diagnostics: "Diagnostics du compte",
    connection_status: "État de la connexion",
    imap_label: "IMAP",
    smtp_label: "SMTP",
    last_checked: "Dernière vérification : {{time}}",
    error_details: "Détails de l'erreur",
    consecutive_failures: "{{count}} échecs d'affilée",
    server_capabilities: "Capacités du serveur",
    tls_information: "Informations TLS",
    run_health_check: "Lancer un diagnostic",
    connection_failed:
      "Nous n'avons pas pu nous connecter. Un autre coup d'œil à vos paramètres, puis un autre essai, suffit en général.",
    removed_forwarding_rule: 'Règle de transfert "{{ name }}" supprimée',
    removed_forwarding_rules_count:
      "{{ count }} règles de transfert supprimées",
    customize_toolbar: "Personnaliser la barre d'outils",
    customize_toolbar_description:
      "Choisissez les actions qui apparaissent dans la barre d’outils du bas.",
    toolbar_dots_hint:
      "Le menu à trois points apparaît toujours avec toutes les options.",
    toolbar_section_quick_actions: "Actions rapides",
    toolbar_section_organize: "Organiser",
    haptic_feedback_title: "Retour haptique",
    haptic_feedback_label: "Vibrer lors des actions importantes",
    swipe_actions: "Actions de balayage",
    swipe_left: "Balayer à gauche",
    swipe_right: "Balayer à droite",
    swipe_none: "Aucun",
    swipe_actions_description:
      "Choisissez ce qui se passe quand vous balayez un e-mail vers la gauche ou la droite.",
    badges_title: "Badges",
    badges_description: "Affichez les badges que vous avez obtenus.",
    badges_description_full:
      "Les badges obtenus sur votre compte sont affichés sur votre profil et éventuellement dans vos e-mails.",
    no_encryption_key: "Aucune clé de chiffrement",
    encryption_key_load_failed:
      "Impossible de charger votre clé de chiffrement. Vérifiez votre connexion et réessayez.",
    encryption_banner_title:
      "Vos clés privées ne quittent jamais votre appareil",
    encryption_banner_you: "Vous",
    encryption_banner_recipient: "Destinataire",
    storage_format_title: "Format de stockage",
    storage_format_aster_server: "Serveur Aster",
    storage_format_decentralized_ipfs: "Décentralisé (IPFS)",
    storage_format_ipfs_confirm_title: "Passer au stockage IPFS",
    choose_notification_events:
      "Choisissez les événements qui déclenchent des notifications",
    quiet_hours_schedule: "Horaires",
    conversation_grouping: "Regroupement des conversations",
    conversation_grouping_confirm_title: "Êtes-vous sûr ?",
    show_message_size: "Afficher la taille des messages",
    show_alias_indicators: "Afficher les indicateurs d'alias",
    show_alias_indicators_description:
      "Marquer les messages reçus via l'un de vos alias",
    auto_save_recipients:
      "Enregistrer automatiquement les destinataires récents",
    disable_recent_recipients_title: "Désactiver les destinataires récents ?",
    disable_and_clear: "Désactiver et effacer les données",
    default_email_app: "Application e-mail par défaut",
    change_plan: "Changer d'offre",
    change_plan_description:
      "Passer à une offre supérieure ou inférieure via le portail de facturation",
    checkout_welcome: "Bienvenue chez Aster ! Votre abonnement est actif.",
    grace_period_remaining:
      "{{days}} jours restants pour mettre à jour votre paiement avant que votre plan ne passe au plan gratuit.",
    update_payment_method: "Mettre à jour le moyen de paiement",
    currency: "Devise",
    select_currency: "Sélectionner la devise",
    switch_to_yearly: "Passer à l'annuel",
    switch_to_monthly: "Passer au mensuel",
    switch_billing_confirm: "Changer le cycle de facturation",
    billing_switched: "Cycle de facturation modifié avec succès",
    failed_switch_billing:
      "Votre cycle de facturation n'a pas changé. Un autre essai devrait suffire. Votre cycle actuel est toujours actif.",
    current_billing_interval: "Facturé {{interval}}",
    switching_billing: "Changement en cours...",
    billing_banner_title: "Débloquez plus avec Aster",
    billing_banner_cta: "Explorer les options",
    storage_addons: "Stockage supplémentaire",
    per_month_short: "/mois",
    add_storage: "Ajouter du stockage",
    popular: "Populaire",
    best_value: "Meilleur rapport qualité-prix",
    purchase_addon: "Acheter l'extension",
    addon_purchased: "Extension de stockage achetée avec succès.",
    cancel_addon: "Annuler",
    addon_cancelled: "Extension de stockage annulée avec succès.",
    active_addons: "Vos extensions actives",
    no_active_addons: "Aucune extension de stockage active.",
    confirm_cancel_addon: "Annuler l'extension de stockage",
    addon_purchase_failed:
      "Nous n'avons pas pu lancer l'achat du complément. Un autre essai devrait suffire. Votre facturation est inchangée.",
    addon_cancel_failed:
      "Nous n'avons pas pu annuler votre complément de stockage. Un autre essai devrait suffire. Votre complément est toujours actif.",
    addon_purchase_success: "Redirection vers le paiement...",
    addon_checkout_opened: "Finalisez votre achat dans le nouvel onglet.",
    plan_recommended: "Recommandé",
    plan_top_tier_title: "Vous avez le forfait le plus élevé",
    plan_top_tier_note:
      "{{plan}} inclut le plus grand stockage de tous les forfaits. Si vous avez besoin de plus d'espace, vous pouvez ajouter du stockage supplémentaire.",
    plan_add_storage_link: "Ajouter du stockage",
    plan_current_title: "Vous utilisez {{plan}}",
    plan_current_note:
      "Vous avez utilisé {{percent}} % de votre stockage, il vous reste donc de la place.",
    plan_storage_tight_note:
      "Vous avez utilisé {{percent}} % de votre stockage. {{plan}} vous offre plus d'espace.",
    per_year_short: "/an",
    save_yearly: "Économisez {{amount}}",
    billing_monthly: "Mensuel",
    billing_yearly: "Annuel",
    subscribe: "S'abonner",
    free_plan_includes: "3 alias · 1 domaine personnalisé",
    upgrade_for_more:
      "Passez à une offre supérieure pour plus de stockage, d'alias et de fonctionnalités",
    upgrade_for_more_short: "Débloquer pour plus",
    plans_coming_soon: "Les abonnements arrivent bientôt. Restez à l'écoute !",
    plan_f_storage: "{{value}} de stockage chiffré",
    plan_f_attachments: "Pièces jointes jusqu'à {{value}}",
    plan_f_aliases: "{{value}} alias e-mail",
    plan_f_domains: "{{value}} domaines personnalisés",
    plan_f_send_limit: "{{value}} e-mails quotidiens",
    plan_f_templates: "{{value}} modèles d'e-mail",
    plan_f_read_receipts: "Accusés de réception",
    plan_tip_attachments:
      "La taille totale des pièces jointes d'un message. Un même fichier peut atteindre 50 Mo.",
    plan_tip_signed_in_accounts:
      "Le nombre de comptes Aster que tu peux garder connectés sur le même appareil en même temps. Chaque compte conserve son propre abonnement ; basculer entre eux demande le mot de passe de chaque compte.",
    plan_tip_send_limit:
      "Compte les adresses hors d'Aster et se réinitialise chaque jour à 00:00 UTC. Les nouveaux comptes démarrent plus bas et atteignent la limite complète au cours de la première semaine.",
    plan_tip_ghost_aliases:
      "Envoie des e-mails depuis une adresse aléatoire pour que les destinataires ne puissent jamais remonter à ta véritable identité.",
    plan_tip_smart_folders:
      "Organise automatiquement les e-mails dans des dossiers selon les règles que tu définis.",
    plan_tip_folder_lock:
      "Verrouille les dossiers sensibles derrière un mot de passe séparé pour une couche de sécurité supplémentaire.",
    plan_tip_sender_pinning:
      "Lock an alias to specific senders - only they can reach you through it.",
    plan_tip_alias_rules:
      "Block or trash emails per alias based on sender or subject.",
    plan_tip_reverse_alias:
      "Reply to any email without revealing your real address.",
    plan_tip_alias_directory:
      "Mail to anything.key@astermail.org auto-creates a new alias on the fly.",
    plan_tip_instant_alias_delete:
      "Supprimez des alias et faites expirer des alias fantômes tout de suite - Supernova ignore le délai de suppression de 30 jours.",
    plan_tip_zero_knowledge:
      "Nous ne pouvons jamais lire tes données, même si nous y étions contraints. Tes clés de chiffrement ne quittent jamais ton appareil.",
    plan_tip_tracker_protection:
      "Les pixels de pistage invisibles sont supprimés avant que les e-mails n'atteignent ta boîte de réception.",
    plan_tip_key_rotation:
      "Fais tourner automatiquement tes clés de chiffrement à intervalles réguliers pour une sécurité accrue.",
    plan_tip_imap_smtp:
      "Connect Apple Mail, Thunderbird, Outlook, or any IMAP client. Powered by the Aster Bridge companion app running on your device.",
    plan_tip_external_accounts:
      "Lie et synchronise les e-mails de fournisseurs externes comme Gmail ou Outlook directement dans Aster via IMAP ou POP3.",
    plan_tip_carddav:
      "Sync your contacts to Contacts on macOS and iOS, DAVx5 on Android, or any CardDAV client. Powered by the Aster Bridge companion app running on your device.",
    plan_tip_alias_avatars:
      "Définis des photos de profil uniques pour chaque alias et adresse de domaine personnalisé",
    plan_f_custom_themes: "Thèmes personnalisés",
    plan_f_smart_folders: "Dossiers intelligents",
    plan_f_imap_smtp: "Accès IMAP et SMTP",
    plan_f_imap_smtp_bridge:
      "Accès depuis votre app de messagerie (IMAP et SMTP) via Aster Bridge",
    plan_f_bridge_hint:
      "Fonctionne via l’app compagnon Aster Bridge sur votre appareil.",
    plan_f_external_accounts: "Comptes externes (IMAP & POP3)",
    plan_f_signed_in_accounts: "Comptes connectés",
    plan_f_caldav: "Synchronisation CalDAV",
    plan_f_encrypted_exports: "Exports chiffrés",
    plan_f_hardware_keys: "Clés de sécurité matérielles",
    plan_f_api_access: "Accès API",
    plan_f_support_email: "Support par e-mail",
    plan_f_support_priority: "Support prioritaire",
    plan_f_support_dedicated: "Support dédié en direct",
    plan_f_ghost_aliases: "{{value}} alias fantômes/mois",
    plan_f_signatures: "{{value}} signatures HTML",
    plan_f_unlimited_folders: "Dossiers et libellés illimités",
    plan_f_unlimited_filters: "Filtres personnalisés illimités",
    plan_f_vacation_reply: "Réponse automatique d'absence",
    plan_f_catch_all: "Adresse e-mail fourre-tout",
    plan_f_auto_forwarding: "Transfert automatique",
    plan_f_subscription_manager: "Gestionnaire d'abonnements",
    plan_f_carddav_import: "Import de contacts CardDAV",
    plan_f_contact_merge: "Assistant de fusion de contacts",
    plan_f_encrypted_export: "Export chiffré",
    plan_f_password_folders: "Dossiers protégés par mot de passe",
    plan_f_custom_key_rotation:
      "Intervalles de rotation des clés personnalisés",
    plan_f_multi_accounts: "{{value}} multi-comptes",
    feature_linked_accounts: "Comptes liés",
    plan_f_receipt_tracking: "Suivi des reçus et des livraisons",
    plan_f_early_access: "Accès anticipé aux nouvelles fonctionnalités",
    plan_f_unlimited_contacts: "Contacts illimités",
    plan_f_unlimited_snoozed: "E-mails en veille illimités",
    plan_f_unlimited_scheduled: "Envois programmés illimités",
    plan_f_auto_delete_spam:
      "Suppression automatique des indésirables et de la corbeille",
    plan_f_quiet_hours: "Heures calmes",
    storage_approaching_title: "Le stockage se remplit.",
    storage_approaching_description:
      "Vous avez utilisé plus de 75 % de votre stockage. Effacer quelques anciens messages, ou mettre à niveau votre plan, vous gardera couvert avant que vous ne manquiez d'espace.",
    storage_warning_title: "Vous arrivez à court de stockage.",
    storage_warning_description:
      "Vous avez utilisé plus de 90 % de votre stockage. Effacer quelques messages, ou mettre à niveau votre plan, gardera le nouveau courrier en circulation.",
    storage_overview_description:
      "Voyez ce qui occupe votre espace et supprimez ce dont vous n'avez pas besoin.",
    storage_promo_title: "Économisez sur le stockage supplémentaire",
    storage_promo_body:
      "Bénéficiez de {{percent}} % de réduction sur vos {{months}} premiers mois de stockage supplémentaire.",
    storage_promo_body_singular:
      "Bénéficiez de {{percent}} % de réduction sur votre premier mois de stockage supplémentaire.",
    storage_promo_note:
      "La réduction s'applique uniquement à votre premier module de stockage.",
    storage_select_option_first:
      "Pour acheter plus de stockage, sélectionnez d’abord une option.",
    storage_promo_cta: "Voir les modules",
    storage_used_of_total: "{{used}} sur {{total}} utilisés",
    storage_free_space:
      "{{size}} libres, {{percent}} de votre stockage utilisé",
    storage_breakdown_title: "Ce qui occupe votre stockage",
    storage_breakdown_empty: "Rien n'occupe encore votre stockage.",
    storage_col_category: "Catégorie",
    storage_col_items: "Éléments",
    storage_items_count: "{{count}} éléments",
    storage_items_count_one: "{{count}} élément",
    storage_col_size: "Taille",
    storage_col_share: "Part",
    storage_capacity_title: "Capacité",
    storage_included_with_plan: "Inclus dans votre offre",
    storage_from_addons: "Depuis les modules",
    storage_family_allocation: "Allocation familiale",
    storage_total_capacity: "Capacité totale",
    storage_available: "Disponible",
    storage_cleanup_done: "Espace libéré",
    storage_cleanup_failed: "Impossible de libérer de l'espace. Réessayez.",
    storage_cleanup_confirm:
      "Cette action supprime définitivement {{count}} éléments et libère {{size}}. Elle est irréversible.",
    storage_locked_title: "Votre stockage est plein.",
    storage_locked_description:
      "Le nouveau courrier est en pause jusqu'à ce que vous libériez de l'espace. Effacer quelques messages, ou mettre à niveau votre plan, le laissera circuler à nouveau. Le courrier existant est en sécurité.",
    storage_locked_bounce_warning:
      "Le courrier entrant sera refusé dans {{days}} jours à moins que de l'espace ne se libère. Effacer quelques messages ou mettre à niveau bientôt continuera de les laisser passer.",
    storage_full:
      "Votre stockage est plein. Pour faire de la place, passez à une offre supérieure ou retirez quelques messages.",
    plan_limit_reached:
      "Vous avez atteint la limite de votre plan actuel. Mettre à niveau, ou retirer quelques éléments pour faire de la place, vous remettra en route.",
    upgrade_to_unlock: "Passez à une offre supérieure pour débloquer plus",
    usage_overview: "Aperçu de l'utilisation",
    usage_aliases: "Alias e-mail",
    usage_domains: "Domaines personnalisés",
    usage_templates: "Modèles d'e-mail",
    usage_signatures: "Signatures",
    usage_ghost_aliases: "Alias fantômes ce mois-ci",
    usage_storage: "Stockage",
    usage_linked_accounts: "Comptes connectés",
    upgrade_linked_accounts_note:
      "Tous vos comptes sont en sécurité. Il s'agit du nombre de comptes que cet appareil garde connectés en même temps.",
    upgrade_linked_accounts_link:
      "Découvrez le fonctionnement des comptes multiples",
    usage_of: "{{current}} sur {{limit}}",
    usage_unlimited: "Illimité",
    usage_at_limit: "Limite atteinte",
    usage_loading: "Chargement des données d'utilisation...",
    promo_code: "Code promo",
    promo_code_placeholder: "Saisir le code promo",
    apply_promo: "Appliquer",
    promo_applied: "Code promo appliqué avec succès !",
    promo_invalid:
      "Ce code promo ne correspond à rien chez nous. Vérifier l'orthographe suffit en général.",
    promo_expired: "Ce code promo n'est plus actif.",
    promo_already_used:
      "Vous avez déjà utilisé ce code promo sur votre compte.",
    promo_discount_percent: "{{value}} % de réduction",
    promo_discount_fixed: "{{value}} $ de réduction",
    promo_validating: "Validation en cours...",
    promo_applying: "Application en cours...",
    promo_apply: "Appliquer",
    checkout_title: "Finalisez votre achat",
    checkout_term_title: "Durée de l'abonnement",
    checkout_term_save: "Économisez {{amount}}",
    checkout_term_per_month: "{{amount}}/mois",
    checkout_term_crypto_only: "Crypto uniquement",
    checkout_card_term_unavailable:
      "La durée de 2 ans est disponible en payant en crypto.",
    checkout_term_total: "{{amount}} au total",
    checkout_method_title: "Moyen de paiement",
    checkout_description:
      "Saisissez vos informations de paiement pour vous abonner.",
    autorenew_notice:
      "Votre abonnement se renouvelle automatiquement au tarif de {amount} jusqu'à son annulation. Pour éviter le prochain prélèvement, annulez-le dans Réglages avant la date de renouvellement.",
    autorenew_notice_short:
      "Votre forfait se renouvelle automatiquement lorsque vous payez par carte. Pour éviter le prochain prélèvement, annulez-le dans Réglages avant la date de renouvellement.",
    payment_complete: "Paiement terminé",
    payment_success: "Paiement réussi !",
    payment_failed:
      "Nous n'avons pas pu débiter votre moyen de paiement. Un autre essai, ou une mise à jour dans Paramètres, Facturation, réglera la chose.",
    payment_activation_pending:
      "Votre paiement a abouti, mais votre offre n’est pas encore active. Actualisez la page dans un instant. Si elle reste inactive, contactez l’assistance.",
    payment_details: "Détails du paiement",
    processing_payment: "Traitement du paiement...",
    subscribe_now: "S'abonner maintenant",
    stripe_secure_notice:
      "Sécurisé par Stripe. Vos informations de paiement sont chiffrées.",
    preparing_checkout: "Préparation du paiement...",
    stripe_not_configured: "Le système de paiement n'est pas configuré.",
    try_again: "Réessayer",
    view_all_features: "Voir toutes les fonctionnalités",
    plan_everything_in: "Tout {{plan}}, et en plus",
    compare_features_show: "Comparer les fonctionnalités par offre",
    compare_features_hide: "Masquer la comparaison",
    compare_plans: "Comparer toutes les offres",
    feature: "Fonctionnalité",
    manage_payment_methods: "Gérer les moyens de paiement",
    payment_methods_title: "Moyens de paiement",
    payment_methods_description: "Gérez vos moyens de paiement enregistrés",
    add_payment_method: "Ajouter un moyen de paiement",
    default_card: "Par défaut",
    card_expires: "Expire le",
    adding_card: "Ajout en cours...",
    card_added: "Moyen de paiement ajouté",
    payment_retry_succeeded:
      "Votre paiement a été accepté. Votre offre reste active.",
    payment_retry_failed:
      "Votre banque a refusé la carte. Essayez un autre moyen de paiement.",
    card_removed: "Moyen de paiement supprimé",
    default_updated: "Moyen de paiement par défaut mis à jour",
    payment_settled:
      "Moyen de paiement par défaut mis à jour. Votre solde impayé est réglé.",
    payment_still_due:
      "Votre carte est enregistrée, mais votre solde impayé n'a pas été réglé. Essayez une autre carte pour conserver votre offre.",
    no_payment_methods: "Aucun moyen de paiement enregistré",
    save_card: "Enregistrer la carte",
    cancel_reason_title: "Avant de partir",
    cancel_reason_description:
      "Qu'est-ce qui vous a décidé à annuler ? C'est facultatif et cela nous aide à nous améliorer.",
    cancel_reason_too_expensive: "Trop cher",
    cancel_reason_not_using: "Je ne l'utilise pas assez",
    cancel_reason_missing_feature:
      "Il manque une fonctionnalité dont j'ai besoin",
    cancel_reason_switched_provider: "Je suis passé à un autre fournisseur",
    cancel_reason_bugs: "Trop de bugs ou de problèmes",
    cancel_reason_privacy_trust:
      "Doutes sur la confidentialité ou la confiance",
    cancel_reason_just_testing: "Je faisais juste un essai",
    cancel_reason_other: "Autre chose",
    cancel_reason_text_placeholder: "Quelque chose à ajouter ? (facultatif)",
    cancel_reason_placeholder_too_expensive:
      "Quel prix vous aurait semblé juste ?",
    cancel_reason_placeholder_not_using:
      "Qu'est-ce qui en aurait fait une habitude ?",
    cancel_reason_placeholder_missing_feature:
      "De quelle fonctionnalité avez-vous besoin ?",
    cancel_reason_placeholder_switched_provider:
      "Vers quel service êtes-vous parti, et qu'est-ce qui vous a convaincu ?",
    cancel_reason_placeholder_bugs: "Quel problème vous a le plus gêné ?",
    cancel_reason_placeholder_privacy_trust:
      "Qu'est-ce qui a suscité cette inquiétude ?",
    cancel_reason_placeholder_just_testing: "Que vouliez-vous découvrir ?",
    cancel_reason_placeholder_other: "Qu'est-ce qui vous a décidé à résilier ?",
    cancel_reason_detail_required:
      "Ajoutez une réponse courte pour que nous puissions agir, ou passez cette étape.",
    cancel_not_cancellable:
      "Cet abonnement ne peut pas être résilié dans l'app. Contactez l'assistance pour le résilier.",
    cancel_failed:
      "Votre forfait n'a pas été résilié. Votre facturation est inchangée, vous pouvez réessayer.",
    cancel_reason_skip: "Passer",
    cancel_reason_continue: "Continuer",
    cancel_impact_title: "Ce qui change si vous annulez",
    cancel_impact_description:
      "Votre offre reste active jusqu'au {{date}}. Ensuite :",
    cancel_impact_description_nodate:
      "À la fin de votre période de facturation actuelle :",
    cancel_impact_loading: "Vérification de ce qui change pour votre compte...",
    cancel_impact_unavailable:
      "Impossible de charger les détails pour le moment. Vous pouvez tout de même continuer.",
    cancel_impact_storage: "Le stockage passe de {{current}} à {{after}}.",
    cancel_impact_storage_over:
      "Vous utilisez {{used}}, ce qui dépasse cette limite. Tant que vous la dépassez, les e-mails entrants sont refusés, et après 7 jours ils le sont définitivement.",
    cancel_impact_aliases:
      "{{count}} alias cessent de recevoir des e-mails {{days}} jours plus tard.",
    cancel_impact_domains: "{{count}} domaines personnalisés sont suspendus.",
    cancel_impact_catch_all: "L'adressage catch-all est désactivé.",
    cancel_impact_templates: "{{count}} modèles d'e-mail sont désactivés.",
    cancel_impact_signatures: "{{count}} signatures sont désactivées.",
    cancel_impact_family:
      "{{count}} membres de la famille passent en période de grâce de {{days}} jours.",
    cancel_impact_family_addresses:
      "{{count}} adresses familiales réservées sont libérées.",
    cancel_impact_features:
      "{{count}} fonctionnalités payantes sont désactivées.",
    cancel_impact_reactivate_hint:
      "Rien n'est supprimé. Un nouvel abonnement rétablit ce qui a été désactivé, dans les limites de votre nouvelle offre.",
    cancel_impact_continue: "Continuer vers l'annulation",
    cancel_offer_title: "Un forfait plus petit à la place",
    cancel_offer_description:
      "Vous pouvez passer à un forfait moins cher et conserver votre compte.",
    cancel_offer_body:
      "{{plan}} coûte {{price}} par mois. Vos messages, alias et réglages restent en place.",
    cancel_offer_switch: "Passer à {{plan}}",
    cancel_offer_hint:
      "Tout ce qui dépasse les limites du forfait plus petit est désactivé comme lors d'une résiliation.",
    cancel_offer_continue: "Continuer la résiliation",
    cancel_final_title: "Confirmer l'annulation",
    cancel_final_description:
      "Votre offre {{plan}} sera annulée et prend fin le {{date}}. Vous gardez un accès complet jusque-là.",
    cancel_final_description_nodate:
      "Votre offre {{plan}} sera annulée à la fin de la période de facturation en cours. Vous gardez un accès complet jusque-là.",
    cancel_final_confirm: "Annuler mon offre",
    cancel_confirm_title: "Annuler l'abonnement",
    cancel_enter_password:
      "Saisissez votre mot de passe pour confirmer l'annulation :",
    cancel_password_placeholder: "Saisir votre mot de passe",
    cancel_confirm_button: "Annuler l'abonnement",
    cancel_password_required:
      "Votre mot de passe confirme que vous voulez annuler.",
    credits: "Crédits",
    credit_balance: "Solde de crédits",
    use_credits_for_renewals: "Utiliser les crédits pour les renouvellements",
    credits_toggle_updated: "Paramètres de crédits mis à jour",
    credits_toggle_failed:
      "Ce réglage ne s'est pas enregistré. Un autre essai devrait suffire. La valeur précédente est toujours active.",
    credits_earn_first:
      "Veuillez d'abord gagner des crédits pour activer cette option",
    recent_transactions: "Transactions récentes",
    view_all_transactions: "Tout voir",
    no_credits_yet:
      "Aucun crédit pour le moment. Gagnez des crédits grâce aux parrainages ou aux cartes cadeaux !",
    credit_type_referral_reward: "Parrainage",
    credit_type_referral_commission: "Commission",
    credit_type_admin_grant: "Bonus",
    credit_type_promo: "Promo",
    credit_type_renewal_deduction: "Renouvellement",
    credit_type_reversal: "Annulation",
    credit_type_purchase: "Achat",
    top_up_credits: "Recharger",
    top_up_credits_description:
      "Ajoutez du crédit à votre compte. Le crédit s’applique automatiquement aux renouvellements de votre offre.",
    credit_packages_loading: "Chargement des offres...",
    credit_packages_failed: "Les offres de crédits ne se sont pas chargées.",
    credit_package_bonus: "+{{ bonus }} offerts",
    credit_package_total: "{{ total }} au total",
    buy_credits: "Acheter du crédit",
    buy_credits_crypto: "Payer en cryptomonnaie",
    buying_credits: "Redirection...",
    credit_purchase_error: "Impossible de démarrer le paiement. Réessayez.",
    credit_pay_card: "Carte",
    credit_pay_crypto: "Cryptomonnaie",
    credits_added_to_account: "Le crédit a été ajouté à votre compte.",
    in_credits: "de crédit",
    credit_transactions: "Transactions de crédits",
    referral_program: "Programme de parrainage",
    your_referral_link: "Votre lien de parrainage",
    copy_link: "Copier le lien",
    link_copied: "Lien copié dans le presse-papiers",
    total_referrals: "Total des parrainages",
    pending_referrals: "En attente",
    completed_referrals: "Terminés",
    credits_earned: "Crédits gagnés",
    referral_not_eligible:
      "Les parrainages ne sont pas disponibles pour le moment.",
    referral_loading: "Chargement des informations de parrainage...",
    referral_history: "Historique des parrainages",
    no_referrals_yet:
      "Aucune invitation pour le moment. Partagez votre lien pour commencer.",
    referral_status_pending: "En attente",
    referral_status_completed: "Terminé",
    referral_reward_info:
      "Votre ami et vous recevez chacun {{ amount }} de stockage supplémentaire. Le stockage arrive après quelques jours d'utilisation de son compte, et il reste sur le vôtre tant qu'il continue d'utiliser Aster Mail.",
    referral_commission_info:
      "Vous gagnez {{ percent }} % de chaque paiement de vos filleuls, tant qu'ils restent abonnés.",
    referral_max_credits: "Gains maximums : {{ value }} par an",
    referral_gauge_earned_label: "Gagné",
    total_earned: "Total gagné",
    affiliate_program: "Programme d'Affiliation",
    affiliate_status_title: "Statut de partenaire affilié",
    affiliate_status_description:
      "Vous êtes inscrit au programme d'affiliation Aster Mail et gagnez {{ percent }}% de commission sur chaque paiement effectué par les abonnés que vous avez parrainés, tant qu'ils restent abonnés.",
    affiliate_commission_rate: "Taux de Commission",
    affiliate_total_earned: "Total Gagné",
    affiliate_amount_owed: "Montant Dû",
    affiliate_paid_out: "Payé",
    affiliate_brand_badge: "Affilié de Marque",
    affiliate_your_link_label: "Votre lien d'affiliation",
    affiliate_lifetime_cap: "Plafond de gains mensuel : {{ value }}",
    affiliate_cap_resets_in: "Réinitialisation dans {{ days }} jours",
    affiliate_info_hint_cap_title: "Plafond de Gains Mensuel",
    affiliate_info_hint_cap:
      "Les commissions d'affiliation sont plafonnées à {{ value }} par mois civil. Une fois le plafond atteint, aucune commission supplémentaire ne s'accumule jusqu'à sa réinitialisation automatique au début du mois suivant, dans {{ days }} jours.",
    affiliate_info_hint_paid_out_title: "Montant Versé",
    affiliate_info_hint_paid_out:
      "Le montant total de commission qui vous a déjà été versé via l'ensemble des demandes de paiement terminées. Ce chiffre ne se réinitialise pas chaque mois.",
    affiliate_info_hint_owed_title: "Montant Dû",
    affiliate_info_hint_owed:
      "Votre solde de commission actuel non versé. Il s'agit du montant disponible que vous pouvez demander lors de votre prochain paiement, et il s'accumule jusqu'à ce que vous en fassiez la demande.",
    affiliate_info_title: "Conditions du programme",
    affiliate_info_step_commission:
      "La commission est calculée au taux de {{ percent }}% sur le montant payé par l'abonné, avant taxes et frais applicables. Elle est récurrente : vous touchez une commission sur chaque paiement de renouvellement effectué par un abonné parrainé tant qu'il reste abonné, pas seulement sur son premier paiement.",
    affiliate_info_step_cap:
      "Les gains totaux sont plafonnés à {{ value }} par mois civil et par affilié de marque. Le plafond se réinitialise automatiquement au début de chaque mois, et aucune commission supplémentaire n'est générée une fois le plafond mensuel atteint.",
    affiliate_info_step_payout:
      "Un solde minimum de 5 $ est requis pour demander un paiement. Les demandes de paiement sont examinées manuellement par notre équipe et, une fois approuvées, généralement traitées sous 3 à 5 jours ouvrés.",
    affiliate_info_step_disclosure:
      "Les affiliés de marque doivent clairement divulguer leur relation d'affiliation avec Aster Mail partout où le programme est promu, conformément aux réglementations applicables en matière de divulgation publicitaire.",
    affiliate_info_step_tax:
      "Vous êtes seul responsable de la déclaration et du paiement de tout impôt dû sur les revenus d'affiliation dans votre juridiction.",
    affiliate_info_step_tax_reporting:
      "Si le total de vos revenus de commission atteint 2 000 $ ou plus au cours d'une année civile, nous sommes tenus de déclarer vos revenus à l'autorité fiscale compétente. Pour cela, nous aurons besoin d'un formulaire W-9 dûment rempli (pour les personnes américaines) ou W-8BEN (pour les personnes non américaines) dans notre dossier, et les paiements suivants seront suspendus jusqu'à sa réception. Si aucun formulaire valide n'est fourni, la législation fiscale peut nous obliger à retenir une partie des paiements futurs. Nous vous contacterons directement si cela s'applique à vous.",
    affiliate_info_step_account_binding:
      "Le statut d'affilié et de partenaire de marque est lié exclusivement à un seul compte Aster Mail. Il ne peut être accordé, transféré ou dupliqué sur plusieurs comptes appartenant à la même personne ou entité.",
    affiliate_info_footer_note:
      "Ces conditions prennent effet à la date de votre inscription et peuvent être mises à jour périodiquement. Si nous apportons une modification importante affectant votre taux de commission, votre plafond mensuel ou vos conditions de paiement, nous vous en informerons directement (dans l'application ou par e-mail) avant son entrée en vigueur. La poursuite de votre participation après cet avis vaut acceptation de la modification.",
    affiliate_payout_processing_note:
      "Les paiements sont examinés manuellement et généralement traités sous 3 à 5 jours ouvrés.",
    affiliate_payout_email_subject: "Demande de Paiement d'Affiliation",
    affiliate_payout_instructions:
      "Demandez votre paiement ci-dessous : nous ouvrirons pour vous un e-mail pré-rempli à hello@astermail.org.",
    affiliate_copy_template: "Demander un Paiement",
    affiliate_template_copied: "Demande de paiement créée",
    affiliate_payout_email_body:
      "Bonjour,\n\nJe souhaite demander mon paiement d'affiliation.\n\nID de demande : {{ request_id }}\nTaux de commission : {{ commission_percent }}%\nTotal gagné : {{ total_earned }}\nDéjà payé : {{ total_paid_out }}\nMontant dû : {{ outstanding }}\n\nMerci de me communiquer les prochaines étapes.\n\nMerci",
    affiliate_nothing_owed:
      "Vous n'avez aucun paiement en attente à demander pour le moment.",
    affiliate_payout_request_failed:
      "Impossible de créer la demande de paiement. Veuillez réessayer.",
    affiliate_email_link_button: "Lien par E-mail",
    affiliate_payout_amount_label: "Montant à demander",
    affiliate_payout_amount_max: "Maximum",
    affiliate_payout_amount_invalid: "Saisissez un montant valide à demander.",
    affiliate_payout_amount_exceeds:
      "Ce montant dépasse votre solde en attente.",
    affiliate_payout_amount_below_minimum:
      "Le montant minimum de paiement est de 5 $.",
    affiliate_learn_more_irs_confirm_title: "Quitter Aster Mail ?",
    affiliate_learn_more_irs_confirm:
      "Vous êtes sur le point d'accéder au site de l'IRS (irs.gov) dans un nouvel onglet.",
    affiliate_payout_history_title: "Historique des Paiements",
    affiliate_payout_history_empty:
      "Aucune demande de paiement pour le moment.",
    affiliate_payout_status_pending: "En attente",
    affiliate_payout_status_accepted: "Payé",
    affiliate_payout_status_rejected: "Rejeté",
    affiliate_payout_requested_on: "Demandé le {{ date }}",
    billing_address: "Adresse de facturation",
    company_name: "Nom de l'entreprise",
    vat_number: "Numéro de TVA",
    address_line1: "Adresse ligne 1",
    address_line2: "Adresse ligne 2",
    city: "Ville",
    state_province: "État / Province",
    postal_code: "Code postal",
    country: "Pays",
    save_address: "Enregistrer l'adresse",
    address_saved: "Adresse de facturation enregistrée",
    address_save_failed:
      "Votre adresse de facturation ne s'est pas enregistrée. Un autre essai devrait suffire. L'adresse précédente est toujours là.",
    saving: "Enregistrement...",
    redeem: "Utiliser",
    redeeming: "Utilisation en cours...",
    data_export: "Exporter vos données",
    request_export: "Demander l'export",
    requesting_export: "Demande en cours...",
    export_requested:
      "Export demandé. Vous recevrez un e-mail lorsqu'il sera prêt.",
    export_ready: "Votre export est prêt à être téléchargé.",
    export_processing: "L'export est en cours de préparation...",
    download_export: "Télécharger",
    export_failed:
      "Nous n'avons pas pu lancer votre export. Un autre essai devrait suffire. Votre courrier est inchangé.",
    biennial: "2 ans",
    all_star_features: "Tout ce qui est dans Star, plus :",
    all_nova_features: "Tout ce qui est dans Nova, plus :",
    yahoo_import: "Yahoo Mail",
    yahoo_import_description: "Export MBOX ou EML",
    icloud_import: "iCloud Mail",
    icloud_import_description: "Export MBOX ou EML",
    manual_import: "Import manuel",
    manual_import_description: "Téléverser des fichiers MBOX, EML ou PST",
    mbox_import: "MBOX",
    eml_import: "EML",
    delete_signature_title: "Supprimer la signature",
    delete_template_title: "Supprimer le modèle",
    password_label: "Mot de passe",
    two_factor_code_label: "Code d'authentification à deux facteurs",
    type_delete_to_confirm: "Tapez {word} pour confirmer",
    deleting_label: "Suppression en cours...",
    delete_account_button: "Supprimer le compte",
    alias_is_available: "Cet alias est disponible.",
    alias_not_available: "Cet alias n'est pas disponible.",
    checking_availability: "Vérification de la disponibilité...",
    domain_promo_title: "Utilisez votre propre domaine personnalisé",
    domain_promo_cta: "Associer votre domaine",
    allow_sender: "Autoriser l'expéditeur",
    sender_added_to_allowlist: "Expéditeur ajouté à la liste autorisée",
    vacation_reply_edit: "Modifier la réponse d'absence",
    vacation_reply_setup: "Configurer la réponse d'absence",
    show_badges_in_signature: "Afficher les badges dans les e-mails",
    import_how_it_works: "Comment ça marche",
    import_oauth_title: "Connexion OAuth",
    import_manual_title: "Import manuel",
    import_oauth_button: "OAuth",
    import_manual_button: "Manuel",
    import_oauth_coming_soon: "Bientôt disponible",
    connected_accounts_title: "Comptes connectés",
    connected_accounts_fallback_name: "Compte connecté",
    connected_accounts_none: "Aucun compte connecté",
    connected_accounts_last_sync: "Dernière synchronisation : {{ time }}",
    connected_accounts_never_synced: "Jamais synchronisé",
    connected_accounts_emails: "{{ count }} e-mails",
    connected_accounts_syncing: "Synchronisation...",
    connected_accounts_sync_now: "Synchroniser maintenant",
    connected_accounts_disconnect: "Déconnecter",
    connected_accounts_error:
      "Ce compte lié a du mal à se synchroniser, et nous réessaierons automatiquement.",
    connected_accounts_password_reauth_needed:
      "Échec de la connexion. Modifiez le compte pour mettre à jour le mot de passe.",
    connected_accounts_reauth_needed:
      "Une nouvelle autorisation est nécessaire. Cliquez sur Reconnecter pour résoudre le problème.",
    connected_accounts_reconnect: "Reconnecter",
    connected_accounts_enabled: "Activé",
    connected_accounts_disabled: "Désactivé",
    oauth_import_success: "Compte {{ provider }} connecté avec succès",
    oauth_import_error:
      "La connexion de votre compte n'a pas fonctionné : {{reason}}. Un autre essai, ou un autre fournisseur, fonctionnera.",
    oauth_import_loading: "Connexion à {{ provider }}...",
    feature_locked:
      "Ceci fait partie du plan {{plan}}. Une mise à niveau l'activera.",
    available_on_plan: "Disponible à partir de l'offre {{plan}}",
    carddav_locked:
      "Importer des contacts depuis des services compatibles CardDAV",
    contact_merge_locked: "Fusionner intelligemment les contacts en double",
    encrypted_export_locked:
      "Exporter vos données avec un chiffrement de bout en bout",
    mail_section: "Courrier",
    about: "À propos",
    scan_qr_code_description:
      "Scannez le code QR avec l'application d'authentification de votre choix",
    cant_scan_enter_manually:
      "Impossible de scanner ? Saisissez ce code manuellement :",
    save_backup_codes_description:
      "Conservez ces codes de secours dans un endroit sûr. Vous pouvez les utiliser pour accéder à votre compte si vous perdez votre appareil d'authentification.",
    copy_all_codes: "Copier tous les codes",
    backup_codes: "Codes de secours",
    regenerate_backup_codes: "Régénérer les codes de secours",
    regenerate_backup_codes_description:
      "Remplace vos codes restants par 10 nouveaux codes de secours à usage unique.",
    backup_codes_regenerated: "Nouveaux codes de secours générés",
    authenticator_or_backup_code: "Code d'authentification ou de secours",
    disable_2fa_code_hint:
      "Saisissez un code à 6 chiffres de votre application d'authentification, ou l'un de vos codes de secours si vous n'y avez plus accès.",
    no_subscriptions_found: "Aucun abonnement trouvé",
    all_clear: "Tout est bon",
    scanning: "Analyse en cours...",
    unsubscribing: "Désabonnement en cours...",
    could_not_unsubscribe: "{{ count }} n'ont pas pu être désabonnés",
    opened_in_browser:
      "{{ count }} archivé(s) - confirmation manuelle peut être nécessaire",
    senders_unsubscribed: "{{ count }} expéditeurs désabonnés",
    bulk_unsubscribe: "Désabonnement en masse",
    rotate_keys: "Renouveler les clés",
    key_rotation_data_loss_warning:
      "Une fois la rotation effectuée, votre ancienne clé est retirée. Les e-mails chiffrés exclusivement avec votre ancienne clé ne pourront plus être déchiffrés. Cette action est irréversible.",
    rotating: "Renouvellement...",
    rotate_keys_description_required:
      "Vos clés de chiffrement doivent être renouvelées. Saisissez votre mot de passe pour générer de nouvelles clés et préserver la confidentialité persistante.",
    rotate_keys_description_manual:
      "Saisissez votre mot de passe pour renouveler vos clés de chiffrement. Vos anciens e-mails restent lisibles.",
    current_key_age: "Âge de la clé actuelle",
    encryption_keys_updated: "Vos clés de chiffrement ont été mises à jour",
    keys_rotated_successfully: "Clés renouvelées avec succès",
    forward_secrecy_protection: "Protection par confidentialité persistante",
    key_rotation_required: "Renouvellement de clé requis",
    rotate_encryption_keys: "Renouveler les clés de chiffrement",
    no_encryption_key_description:
      "Votre clé de chiffrement sera générée automatiquement",
    encryption_banner_subtitle:
      "Les e-mails sont chiffrés avant de quitter votre appareil. Aster ne stocke que du texte chiffré illisible, nous ne pouvons jamais voir votre courrier.",
    storage_format_description:
      "Activez le stockage décentralisé pour stocker vos fichiers et contenus statiques dans le système de fichiers interplanétaire (IPFS).",
    storage_format_ipfs_confirm_description:
      "Êtes-vous sûr de vouloir passer au stockage IPFS chiffré de bout en bout ?",
    quiet_hours_schedule_description:
      "Définir les heures de début et de fin des heures calmes",
    conversation_grouping_description:
      "Regrouper les e-mails d'une même conversation ensemble",
    conversation_grouping_confirm_description:
      "Désactiver le regroupement des conversations affichera chaque e-mail séparément dans votre boîte de réception au lieu de regrouper les réponses. Cela peut rendre le suivi des fils de discussion plus difficile.",
    show_message_size_description:
      "Afficher la taille de chaque e-mail dans la liste de la boîte de réception",
    auto_save_recipients_description:
      "Mémoriser automatiquement les adresses e-mail de vos destinataires pour une rédaction plus rapide",
    disable_recent_recipients_description:
      "Cela supprimera définitivement toutes les données de destinataires récents enregistrées. Cette action est irréversible.",
    default_email_app_description:
      "Ouvrir les liens mailto: dans Aster Mail au lieu de votre application e-mail par défaut",
    payment_failed_warning:
      "Le dernier débit sur votre moyen de paiement n'est pas passé. Le mettre à jour dans Paramètres, Facturation gardera votre plan actif. Votre courrier n'est pas affecté.",
    prices_in_usd_note:
      "Prix affichés en USD. Le montant final est déterminé lors du paiement.",
    prices_converted_note:
      "Les prix sont convertis depuis le dollar américain et sont approximatifs. Vous voyez le montant exact, frais de conversion inclus, au moment du paiement.",
    switch_billing_description:
      "Votre cycle de facturation sera modifié immédiatement. Un crédit ou un montant au prorata sera appliqué à votre prochaine facture.",
    switch_billing_savings:
      "Passer à la facturation annuelle vous fait économiser {{amount}} par an.",
    plan_change_confirm_title: "Confirmer le changement de plan",
    plan_change_confirm_description:
      "Passage a {{plan}}. Le temps restant de votre plan actuel est credite vers le nouveau plan.",
    plan_change_credit: "Credit du plan actuel",
    plan_change_due_today: "A payer aujourd'hui",
    plan_change_preview_failed:
      "Impossible de charger le detail du prix. Veuillez reessayer.",
    plan_change_confirm_button: "Confirmer et payer",
    plan_change_confirming: "Traitement en cours...",
    billing_banner_subtitle:
      "Passez à une offre supérieure ou achetez du stockage supplémentaire pour protéger votre vie privée.",
    storage_addons_monthly_note:
      "Le stockage supplémentaire est facturé chaque mois, même si votre forfait est facturé chaque année.",
    storage_addons_description:
      "Besoin de plus d'espace ? Achetez du stockage chiffré supplémentaire pour votre compte.",
    storage_purchase_coming_soon:
      "Les extensions de stockage arrivent bientôt. Restez à l'écoute !",
    confirm_cancel_addon_description:
      "Êtes-vous sûr de vouloir annuler cette extension de stockage ? Votre stockage supplémentaire restera disponible jusqu'à la fin de la période de facturation en cours.",
    free_plan_description:
      "Vous êtes sur l'offre gratuite. Découvrez les offres payantes ci-dessous pour plus de stockage, d'alias et de fonctionnalités.",
    free_plan_banner_title: "Vous êtes sur l'offre gratuite",
    usage_overview_description:
      "Suivez votre utilisation actuelle des fonctionnalités de votre offre.",
    cancel_confirm_description:
      "Êtes-vous sûr de vouloir annuler votre abonnement ? Votre offre restera active jusqu'à la fin de la période de facturation en cours.",
    cancel_password_error:
      "Nous n'avons pas pu annuler votre plan. Vérifier votre mot de passe et réessayer suffit en général. Votre plan et votre facturation sont inchangés.",
    credits_description:
      "Gagnez des crédits grâce aux parrainages, codes promo et cartes cadeaux. Les crédits peuvent être utilisés pour vos renouvellements.",
    use_credits_for_renewals_description:
      "Appliquer automatiquement votre solde de crédits aux renouvellements d'offre et d'extensions. Si votre solde ne couvre pas le montant total, le reste sera débité sur votre moyen de paiement.",
    referral_program_description:
      "Invitez un ami sur Aster Mail. Vous recevez chacun {{ amount }} de stockage supplémentaire dès qu'il commence à utiliser son compte.",
    referral_not_eligible_description: "Veuillez réessayer plus tard.",
    billing_address_description:
      "Ajoutez vos coordonnées de facturation pour qu'elles apparaissent sur vos factures.",
    data_export_description:
      "Téléchargez une copie de toutes vos données, y compris les e-mails, contacts et paramètres.",
    delete_signature_message:
      "Êtes-vous sûr de vouloir supprimer cette signature ? Cette action est irréversible.",
    delete_template_message:
      "Êtes-vous sûr de vouloir supprimer ce modèle ? Cette action est irréversible.",
    all_info_permanently_deleted:
      "Toutes vos informations seront définitivement supprimées.",
    domain_promo_subtitle:
      "Associez votre domaine pour envoyer et recevoir des e-mails avec votre propre adresse personnalisée",
    domain_purchase_banner_title: "Obtenez votre propre domaine e-mail",
    domain_purchase_banner_subtitle:
      "Recherchez, achetez et recevez des e-mails en quelques secondes. Le DNS est configuré pour vous.",
    domain_purchase_banner_cta: "Acheter un domaine",
    domain_purchase_title: "Acheter un domaine",
    domain_purchase_search_placeholder: "Rechercher un nom de domaine",
    domain_purchase_per_year: "{{price}}/an",
    domain_purchase_taken: "Indisponible",
    domain_purchase_no_results: "Aucun domaine disponible trouvé",
    domain_purchase_renews_at: "Renouvellement à {{price}}/an",
    domain_purchase_years: "Période d'enregistrement",
    domain_purchase_one_year: "1 an",
    domain_purchase_n_years: "{{count}} ans",
    domain_purchase_pay_with: "Payer avec",
    domain_purchase_pay_card: "Carte",
    domain_purchase_pay_crypto: "Cryptomonnaie",
    domain_purchase_buy: "Acheter pour {{price}}",
    domain_purchase_error: "L'achat a échoué. Veuillez réessayer.",
    domain_purchase_error_taken:
      "Ce domaine vient d'être pris. Veuillez en choisir un autre.",
    domain_purchase_error_limit:
      "Vous avez atteint la limite de domaines de votre offre. Passez à une offre supérieure pour en ajouter.",
    domain_purchase_error_slow_down:
      "Trop de commandes de domaines en cours. Terminez celles en cours ou patientez un instant.",
    domain_purchase_progress_title: "Configuration de {{domain}}",
    domain_purchase_step_payment: "Paiement reçu",
    domain_purchase_step_registering: "Enregistrement auprès de NameSilo",
    domain_purchase_step_dns: "Configuration du DNS",
    domain_purchase_step_activating: "Activation des boîtes mail",
    domain_purchase_step_done: "Domaine actif",
    domain_purchase_done_note:
      "Votre domaine est prêt. Vous pouvez maintenant y créer des adresses et des alias.",
    domain_purchase_slow_note:
      "Cela prend plus de temps que d'habitude. Nous terminerons en arrière-plan et vous préviendrons par e-mail.",
    domain_purchase_refunded:
      "Ce domaine est devenu indisponible avant que nous puissions l'enregistrer. Votre paiement a été remboursé.",
    domain_purchase_try_instead: "Essayez plutôt l'une de ces alternatives",
    domain_purchase_empty_subtitle:
      "Entrez un mot, un nom ou un domaine complet. Nous vérifions chaque extension que nous vendons et vous montrons ce qui est libre.",
    domain_purchase_empty_included:
      "Chaque domaine inclut la confidentialité WHOIS, le DNS configuré pour vous et des adresses illimitées.",
    domain_purchase_terms_inline:
      "Les domaines sont enregistrés via NameSilo. En achetant, vous acceptez les {{aster}}, {{registrar}} et {{icann}}. Les enregistrements sont définitifs une fois le domaine créé.",
    domain_purchase_empty_title: "Saisissez quelque chose pour commencer",
    domain_purchase_search_failed: "La recherche a échoué. Veuillez réessayer.",
    domain_purchase_retry: "Réessayer",
    domain_purchase_step_choose: "Choisir un nom",
    domain_purchase_step_checkout: "Paiement",
    domain_purchase_step_activate: "Mise en ligne",
    domain_purchase_intro_title: "Trouvons votre domaine e-mail",
    domain_purchase_intro_sub:
      "Répondez à deux questions rapides et nous vous montrerons ce qui est disponible.",
    domain_purchase_intro_name_q:
      "Quel nom voulez-vous ? Votre entreprise, votre projet ou simplement vous.",
    domain_purchase_intro_name_ph:
      "Saisissez un nom, comme cafeduport ou alexcarter",
    domain_purchase_intro_tld_q: "Une extension préférée ?",
    domain_purchase_intro_cta: "Voir ce qui est disponible",
    domain_purchase_intro_skip: "Passer, je chercherai moi-même",
    domain_purchase_intro_replay: "Revoir le démarrage guidé",
    domain_purchase_intro_examples: "Ou partez d'un exemple",
    domain_purchase_intro_tld_title: "Choisissez maintenant une extension",
    domain_purchase_intro_tld_sub:
      "L'extension change le prix et la personnalité de votre adresse. Si vous hésitez, laissez Toutes sélectionné et nous vous montrerons tout ce qui convient.",
    domain_purchase_results_for: "Voici ce que nous avons trouvé pour {{name}}",
    domain_purchase_results_for_sub:
      "Choisissez celui qui vous plaît. Le paiement ne prend qu'une minute et votre nouvelle adresse peut recevoir des e-mails dès que vous avez terminé.",
    domain_purchase_change_name: "Changer de nom",
    domain_purchase_purchased_desc:
      "Les domaines achetés via Aster apparaissent ici et fonctionnent automatiquement comme des domaines personnalisés. Choisissez un nom, payez et utilisez-le immédiatement.",
    domain_purchase_filter_price: "Prix maximum",
    domain_purchase_filter_price_any: "Tous les prix",
    domain_purchase_more_suggestions: "Générer plus d'idées",
    domain_purchase_sort_by: "Trier par",
    domain_purchase_order_summary: "Récapitulatif de commande",
    domain_purchase_summary_whois: "Confidentialité WHOIS",
    domain_purchase_summary_dns: "Configuration DNS automatique",
    domain_purchase_summary_included: "Inclus",
    domain_purchase_total_today: "Total aujourd'hui",
    domain_purchase_years_line: "Enregistrement de {{count}} an(s)",
    domain_purchase_secure_checkout: "Paiement sécurisé par Stripe",
    domain_purchase_crypto_warning_title:
      "Rechargez d'abord votre solde crypto",
    domain_purchase_crypto_warning_body:
      "Les commandes en crypto sont réglées avec votre solde crypto Aster. Ajoutez des fonds avant d'acheter, sinon le domaine restera en attente jusqu'à ce que le solde couvre la totalité du montant.",
    domain_purchase_crypto_warning_hint:
      "Vous pouvez recharger depuis la Facturation, c'est le même solde que le crédit du compte.",
    domain_purchase_included_heading:
      "Tout ce qui est inclus avec votre domaine",
    domain_purchase_renew: "Renouveler",
    domain_purchase_manage: "Gérer",
    domain_purchase_manage_description:
      "Vérifiez cet enregistrement et renouvelez-le avant son expiration.",
    domain_purchase_manage_status: "Statut",
    domain_purchase_manage_status_active: "Actif",
    domain_purchase_manage_status_expiring: "Expire bientôt",
    domain_purchase_manage_registered: "Enregistré",
    domain_purchase_manage_expires: "Expire",
    domain_purchase_manage_term: "Durée",
    domain_purchase_manage_paid: "Payé",
    domain_purchase_manage_auto_renew_note:
      "Ce domaine ne se renouvelle pas automatiquement. Pour le conserver, renouvelez-le avant la date d'expiration.",
    domain_purchase_manage_dns: "Ouvrir la configuration du domaine",
    domain_purchase_manage_support_note:
      "Pour transférer ce domaine vers un autre bureau d'enregistrement ou demander un remboursement, contactez l'assistance.",
    domain_purchase_manage_support_subject: "Aide concernant {{domain}}",
    domain_purchase_filter_all: "Tous",
    domain_purchase_filter_available: "Disponibles",
    domain_purchase_filter_taken: "Pris",
    domain_purchase_sort_label: "Trier",
    domain_purchase_sort_relevance: "Pertinence",
    domain_purchase_sort_price_low: "Prix : croissant",
    domain_purchase_sort_price_high: "Prix : décroissant",
    domain_purchase_sort_az: "Nom : de A à Z",
    domain_purchase_sort_discount: "Meilleure remise",
    domain_purchase_show_more: "Afficher plus de résultats",
    domain_purchase_results_count: "{{count}} résultats",
    domain_purchase_discount_tooltip:
      "Prix promotionnel de première année de notre registrar. Ensuite, renouvellement à {{price}} par an.",
    domain_purchase_purchased_info:
      "Voici les domaines que vous avez achetés via Aster. Nous les enregistrons pour vous avec la confidentialité WHOIS, configurons automatiquement tout le DNS du courrier, et vous pouvez y créer des adresses immédiatement. Chaque domaine n'est renouvelé qu'avec votre accord. Si vous souhaitez plus tard déplacer un domaine vers un autre registrar, notre support s'occupe du transfert. L'ICANN verrouille les nouvelles inscriptions pendant leurs 60 premiers jours.",
    domain_purchase_dont_have:
      "Pas de domaine ? Cliquez ici pour en acheter un.",
    domain_purchase_sort_price: "Prix le plus bas",
    domain_purchase_leave_title: "Quitter Aster Mail ?",
    domain_purchase_leave_message:
      "Ce lien ouvre {{host}} dans un nouvel onglet.",
    domain_purchase_purchased_label: "Domaines achetés",
    domain_purchase_purchased_empty: "Aucun domaine acheté pour l'instant",
    domain_purchase_purchased_expires: "Expire le {{date}}",
    domain_purchase_purchased_in_progress: "Configuration en cours...",
    domain_purchase_purchased_awaiting: "En attente de paiement",
    domain_purchase_awaiting_note:
      "Nous n'avons pas encore reçu votre paiement. Terminez le paiement pour finaliser votre commande, ou fermez cette fenêtre et payez plus tard depuis Domaines achetés.",
    domain_purchase_done_warmup:
      "À savoir : le DNS de votre domaine peut mettre jusqu'à une heure à se propager sur internet, et des fournisseurs comme Gmail traitent avec prudence les domaines tout neufs. La délivrabilité s'améliore à mesure que votre domaine se construit un historique.",
    domain_purchase_create_first_address: "Créez votre première adresse",
    domain_purchase_progress_note:
      "Veuillez patienter pendant que nous enregistrons votre domaine et configurons vos boîtes mail. Cela prend généralement environ une minute.",
    domain_purchase_complete_cta: "Finaliser l'achat",
    domain_purchase_purchased_lapsed: "Expiré - racheter",
    domain_purchase_error_paused:
      "Les achats de domaines sont en pause quelques minutes. Réessayez dans un instant.",
    domain_purchase_error_not_allowed:
      "Ce domaine n'est pas disponible sur votre compte pour le moment. Essayez un autre nom ou contactez le support.",
    domain_purchase_order_expired:
      "Cette commande a expiré avant d'être payée. Lancez un nouvel achat pour obtenir le domaine.",
    domain_purchase_order_lapsed:
      "Ce domaine a atteint sa date d'expiration et n'est plus actif. Rachetez-le pour le récupérer.",
    domain_purchase_terms_notice:
      "Aster enregistre le domaine en votre nom via notre registrar partenaire, et le prix de renouvellement est toujours affiché avant le paiement. Si vous laissez un jour un domaine expirer, le registrar peut facturer des frais de récupération pour le restaurer.",
    domain_purchase_terms_aster: "Conditions d'utilisation d'Aster",
    domain_purchase_terms_registrar: "Conditions générales de NameSilo",
    domain_purchase_terms_icann:
      "Droits et responsabilités des titulaires ICANN",
    domain_purchase_detail_privacy_title: "Privé par défaut",
    domain_purchase_detail_setup_title: "Zéro configuration",
    domain_purchase_detail_instant_title: "Prêt en quelques secondes",
    domain_purchase_detail_ownership_title: "Il vous appartient",
    allowlist_popup_description:
      "Les e-mails de cet expéditeur ou domaine ne seront jamais marqués comme indésirables et arriveront toujours dans votre boîte de réception.",
    block_sender_popup_description:
      "Les e-mails de cet expéditeur seront automatiquement filtrés de votre boîte de réception.",
    show_badges_in_signature_description:
      "Afficher vos badges dans la zone de signature des e-mails sortants.",
    import_oauth_description:
      "Connectez votre compte Gmail, Outlook ou Yahoo en un clic. Nous importerons et chiffrerons automatiquement vos e-mails sur votre appareil.",
    import_manual_step_1:
      "Exportez vos e-mails depuis votre fournisseur actuel au format MBOX, EML ou PST",
    import_manual_step_2:
      "Pour Gmail, utilisez Google Takeout. Pour Outlook, exportez en PST ou MBOX",
    import_manual_step_3:
      "Sélectionnez votre fournisseur ci-dessus et cliquez sur « Manuel » pour téléverser vos fichiers",
    import_manual_step_4:
      "Vos e-mails sont chiffrés sur votre appareil avant d'être stockés",
    vacation_reply_locked:
      "Les réponses d'absence vous permettent d'envoyer des réponses automatiques lorsque vous êtes absent",
    catch_all_locked:
      "Le fourre-tout reçoit les e-mails envoyés à n'importe quelle adresse de votre domaine",
    auto_forward_locked:
      "Transférer automatiquement les e-mails entrants vers une autre adresse",
    subscription_manager_locked:
      "Gérez vos abonnements aux newsletters et désabonnez-vous en masse",
    quiet_hours_locked:
      "Désactivez les notifications pendant des heures précises pour rester concentré",
    folder_lock_locked:
      "Protégez les dossiers sensibles avec un mot de passe supplémentaire",
    key_rotation_locked:
      "Définissez des intervalles personnalisés pour la rotation automatique des clés de chiffrement",
    receipt_tracking_locked:
      "Extraire automatiquement les détails d'achat des e-mails de reçus",
    add_security_key: "Ajouter une clé de sécurité",
    addon_limit_one_active:
      "Un seul module complémentaire peut être actif à la fois.",
    alias_local_part_placeholder: "alias",
    allowlist_tab: "Liste autorisée",
    attachments_suffix: "pièce(s) jointe(s)",
    auto_delete_spam_description:
      "Supprimer automatiquement les spams après 30 jours.",
    auto_forward_tab_label: "Transfert automatique",
    billing_postal: "Code postal de facturation",
    billing_postal_placeholder: "Code postal",
    block_remote_css_description:
      "Empêcher le chargement de feuilles de style externes.",
    block_remote_css_label: "Bloquer les CSS distants",
    strip_exif_on_compose_label: "Supprimer les métadonnées des images",
    strip_exif_on_compose_description:
      "Supprimer les métadonnées EXIF et autres des images avant l'envoi pour protéger votre emplacement et les informations de votre appareil",
    account_protection_title: "Protection du compte",
    account_protection_weak: "Faible",
    account_protection_fair: "Passable",
    account_protection_partial: "Partielle",
    account_protection_strong: "Forte",
    account_protection_hint_weak:
      "Votre compte est à risque. Activez plus d'options de protection maintenant.",
    account_protection_hint_fair:
      "Votre compte a besoin de plus de protection.",
    account_protection_hint_partial:
      "Activez plus d'options pour une protection renforcée.",
    account_protection_hint_strong: "Votre compte est bien protégé.",
    account_security_percent_title:
      "La sécurité de votre compte est de {{percent}} %",
    account_security_review_subtitle:
      "Veuillez vérifier régulièrement vos paramètres de sécurité et mettre à jour votre mot de passe.",
    account_security_dismiss: "Ignorer",
    account_security_review_cta: "Vérifier la sécurité",
    account_security_dont_show_again: "Ne plus afficher",
    protection_breakdown_title: "Détail de la protection",
    criterion_two_factor: "Authentification à deux facteurs",
    criterion_recovery_email: "E-mail de récupération vérifié",
    criterion_auto_lock: "Verrouillage automatique",
    criterion_login_alerts: "Alertes de connexion",
    criterion_forward_secrecy: "Confidentialité persistante",
    action_recommended: "Action recommandée",
    two_step_verification_enabled_description:
      "Votre compte nécessite un code de vérification en plus de votre mot de passe.",
    two_step_verification_recommendation:
      "Activez la vérification en deux étapes pour protéger votre compte même si votre mot de passe est volé.",
    no_passkeys_recommendation:
      "Ajoutez une clé d'accès pour une connexion plus rapide et plus sécurisée grâce à la biométrie ou au code PIN de votre appareil.",
    password_weak_recommendation:
      "Votre mot de passe pourrait être plus fort. Envisagez de le remplacer par un mot de passe plus long et plus unique.",
    login_alerts_off_recommendation:
      "Activez les alertes de connexion pour être averti chaque fois qu'un nouvel appareil se connecte à votre compte.",
    block_remote_fonts_description:
      "Empêcher le chargement de polices externes.",
    block_remote_fonts_label: "Bloquer les polices distantes",
    block_remote_images_description:
      "Empêcher le chargement d'images externes.",
    block_remote_images_label: "Bloquer les images distantes",
    block_spy_pixels: "Bloquer les pixels espions",
    block_spy_pixels_description:
      "Empêcher le suivi par pixel caché dans les e-mails.",
    block_tracking_links: "Bloquer les liens de suivi",
    block_tracking_links_description:
      "Nettoyer les paramètres de suivi des liens.",
    blocked_tab: "Liste bloquée",
    browser_on_os: "{{browser}} sur {{os}}",
    card_cvc: "CVC",
    card_expiry: "Date d'expiration",
    card_number: "Numéro de carte",
    cardholder_name: "Nom du titulaire",
    cardholder_name_placeholder: "Prénom Nom",
    cashapp_redirect_notice: "Vous serez redirigé vers Cash App.",
    catch_all_disabled: "Attrape-tout désactivé",
    catch_all_enabled_toast: "Attrape-tout activé",
    checkout_billing_email: "E-mail de facturation",
    checkout_billing_postal: "Code postal de facturation",
    checkout_card_cvc: "CVC",
    checkout_card_expiry: "Date d'expiration",
    checkout_card_number: "Numéro de carte",
    checkout_cardholder_name: "Nom du titulaire",
    checkout_iban: "IBAN",
    checkout_method_card: "Carte bancaire",
    checkout_method_cashapp: "Cash App",
    checkout_method_crypto: "Cryptomonnaie",
    checkout_method_sepa: "Virement SEPA",
    checkout_method_wallet: "Portefeuille numérique",
    checkout_pay_now: "Payer maintenant",
    composing_and_replies: "Rédaction et réponses",
    confirm_remove_key: "Supprimer cette clé de sécurité ?",
    connect_modal_description:
      "Connectez-vous à {{ provider }} pour importer vos e-mails dans Aster. Vos messages sont chiffrés sur cet appareil avant d'être stockés sur nos serveurs.",
    connect_modal_privacy_note: "Vos identifiants ne sont jamais stockés.",
    connect_modal_title: "Connecter {{ provider }} à Aster",
    connect_provider_name_google: "Google",
    connect_provider_name_microsoft: "Microsoft",
    connect_provider_name_yahoo: "Yahoo",
    connect_sign_in_google: "Se connecter avec Google",
    connect_sign_in_microsoft: "Se connecter avec Microsoft",
    connect_sign_in_yahoo: "Se connecter avec Yahoo",
    connected_accounts_no_new_emails: "Aucun nouvel e-mail",
    conversation_order: "Ordre des conversations",
    conversation_order_description:
      "Choisissez comment les messages sont triés dans les conversations.",
    credit_task_earned: "Gagné",
    credit_task_ios_hint_coming: "Bientôt disponible",
    credit_task_ios_title: "Installer sur iOS",
    credit_task_refer_cta: "Parrainer",
    credit_task_refer_hint:
      "Gagnez un pourcentage de chaque paiement de votre ami une fois qu'il s'abonne.",
    credit_task_refer_title: "Parrainer un ami",
    credit_type_install_android: "Installation Android",
    credit_type_install_desktop: "Installation sur ordinateur",
    credit_type_install_ios: "Installation iOS",
    credit_type_refunded: "Remboursé",
    credit_type_spent: "Dépensé",
    credit_type_clawback: "Reprise",
    credit_type_admin_removal: "Suppression",
    credit_type_crypto_overpayment: "Trop-perçu",
    credit_type_crypto_overpayment_reversal: "Annulation du trop-perçu",
    credit_type_prepaid_switch_residual: "Changement de forfait",
    credit_type_prepaid_switch_residual_reversal: "Annulation du changement",
    credits_balance_label: "Solde de crédits",
    credits_balance_note:
      "Les crédits sont appliqués lors de votre prochain renouvellement.",
    credits_shop_plans: "Voir les forfaits",
    credits_subtitle: "Gagnez des crédits en parrainant des amis.",
    credits_title: "Crédits",
    crypto_cancelled_toast: "Paiement en crypto annulé",
    crypto_modal_confirm: "Confirmer le paiement",
    crypto_price_unavailable:
      "Le tarif en crypto n'est pas disponible pour cette offre. Contactez le support.",
    crypto_charged_in_usd: "Facturé en USD.",
    crypto_native_continue: "Continuer",
    crypto_native_choose_method: "Choisissez votre mode de paiement",
    crypto_native_loading_coins: "Chargement des options de paiement...",
    crypto_native_on_chain: "sur {{chain}}",
    crypto_native_recommended: "Recommandé",
    crypto_native_resume_selected: "Sélectionné",
    crypto_native_status_underpaid: "Partiellement payé",
    crypto_native_what_happens: "Ce qui se passe ensuite",
    crypto_native_stripe_option: "Payer en stablecoin",
    crypto_native_stripe_desc:
      "USDC et autres stablecoins via notre prestataire de paiement",
    crypto_native_too_many_open:
      "Vous avez trop de factures crypto en cours. Terminez-en une ou annulez-la d'abord.",
    crypto_native_daily_limit:
      "Vous avez créé trop de factures crypto aujourd'hui. Veuillez réessayer plus tard.",
    crypto_native_invoice_title: "Payer en {{coin}}",
    crypto_native_awaiting_body:
      "Envoyez le montant exact à l'adresse ci-dessous. Cette page se met à jour automatiquement.",
    crypto_native_received_title: "Paiement reçu",
    crypto_native_received_body:
      "Le montant total a été reçu et est en cours de traitement. Aucun paiement supplémentaire n'est nécessaire.",
    crypto_native_send_exactly: "Envoyez exactement",
    crypto_native_send_remaining: "Envoyez le montant restant",
    crypto_native_to_address: "À cette adresse",
    crypto_native_open_wallet: "Ouvrir dans le portefeuille",
    crypto_native_status_processing: "Traitement en cours",
    crypto_native_hint_processing:
      "Ce paiement est en cours de traitement. Cette page se met à jour toute seule, vous n'avez rien à faire.",
    crypto_native_copy_invoice_ref: "Copier la référence de la facture",
    crypto_native_no_wallet_handler:
      "Aucune application de portefeuille ne s'est ouverte. Copiez l'adresse et collez-la dans votre portefeuille.",
    crypto_native_copied: "Copié dans le presse-papiers",
    crypto_native_network_warning:
      "N'envoyez que des {{coin}} sur le réseau {{chain}}. Envoyer un autre actif ou utiliser un autre réseau entraînera la perte des fonds.",
    crypto_native_usd_value_label: "Montant dû",
    crypto_native_usd_total_label: "Total de la facture",
    crypto_native_rate_locked:
      "Votre taux est bloqué jusqu'à l'expiration de cette facture.",
    crypto_native_expires_in: "Expire dans {{time}}",
    crypto_native_status_awaiting: "En attente du paiement",
    crypto_native_status_detected: "Paiement détecté",
    crypto_native_status_confirming: "Confirmation ({{current}}/{{required}})",
    crypto_native_status_confirming_short: "Confirmation",
    crypto_native_status_credited: "Paiement reçu",
    crypto_native_underpaid_body:
      "Nous avons reçu {{received}} sur {{expected}} {{coin}}. Envoyez les {{remaining}} {{coin}} restants à la même adresse pour finaliser cette facture.",
    crypto_native_manual_review: "En cours d'examen",
    crypto_native_manual_review_body:
      "Votre paiement nécessite une vérification manuelle rapide. Nous créditerons votre compte sous peu.",
    crypto_native_transaction: "Transaction",
    crypto_native_refund_notice:
      "Les trop-perçus et les remboursements sont crédités sur le solde de votre compte Aster.",
    crypto_native_cancel_invoice: "Annuler cette facture",
    crypto_native_cancel_failed: "Impossible d'annuler cette facture.",
    crypto_native_cancel_has_payment:
      "Un paiement a déjà été reçu pour cette facture, elle ne peut donc plus être annulée.",
    crypto_native_paid_title: "Tout est prêt",
    crypto_native_paid_body: "Votre offre est maintenant active. Merci !",
    crypto_native_paid_body_addon:
      "Votre option de stockage est maintenant active. Merci !",
    crypto_native_go_to_inbox: "Aller à la boîte de réception",
    crypto_native_view_billing: "Retour à la facturation",
    crypto_native_invoice_cancelled: "Facture annulée",
    crypto_native_expired_title: "Cette facture a expiré",
    crypto_native_expired_body:
      "Les taux évoluent, cette fenêtre de paiement est donc close. Lancez un nouveau paiement pour continuer.",
    crypto_native_cancelled_body:
      "Ce paiement a été annulé. Rien n'a été débité. Vous pouvez lancer un nouveau paiement quand vous le souhaitez.",
    crypto_native_start_new_payment: "Lancer un nouveau paiement",
    crypto_native_check_now: "Vérifier maintenant",
    crypto_native_checking: "Vérification",
    crypto_native_check_no_change:
      "Nous n'avons pas encore vu votre paiement, mais nous continuons à surveiller.",
    crypto_native_check_updated: "Statut du paiement mis à jour : {{status}}",
    crypto_native_check_failed:
      "Le réseau est injoignable. Votre paiement n'est pas affecté. Réessayez dans un instant.",
    crypto_native_last_checked: "Dernière vérification à {{time}}",
    crypto_native_copy_amount: "Copier le montant",
    crypto_native_copy_address: "Copier l'adresse",
    crypto_native_verify_address:
      "Avant d'envoyer, comparez l'adresse affichée dans votre portefeuille avec celle indiquée ici. Seule cette adresse est surveillée pour votre commande.",
    crypto_native_fee_headroom:
      "Si votre portefeuille prélève les frais de réseau sur le montant saisi, ajoutez un peu plus pour que le montant complet arrive.",
    crypto_native_expired_do_not_send:
      "N'envoyez rien à l'adresse de cette facture. Les fonds envoyés maintenant devront faire l'objet d'une vérification manuelle avant d'être crédités.",
    crypto_native_not_found: "Nous n'avons pas trouvé cette facture",
    crypto_native_unavailable: "Impossible de charger le paiement",
    crypto_native_unavailable_body:
      "Nous n'avons pas pu joindre le serveur. Vérifiez votre connexion et réessayez. Votre paiement n'est pas affecté.",
    crypto_native_pending_banner:
      "Vous avez un paiement en cryptomonnaie en cours",
    crypto_native_pending_banner_action: "Reprendre le paiement",
    crypto_native_pending_banner_multi:
      "Vous avez {{count}} paiements en cryptomonnaie en cours",
    crypto_native_back_hint:
      "Cette facture est toujours ouverte. Vous pouvez la reprendre depuis Facturation à tout moment.",
    crypto_native_scan_hint: "Scannez avec votre application de portefeuille",
    crypto_native_scan_hint_address_only:
      "Scannez avec votre application de portefeuille, puis saisissez {{amount}} manuellement",
    crypto_native_network_label: "Réseau",
    crypto_native_confirmations_label: "Confirmations",
    crypto_native_confirmations_value: "{{current}} sur {{required}}",
    crypto_native_received_label: "Reçu jusqu'ici",
    crypto_native_invoice_ref_label: "Facture",
    crypto_native_paying_with_label: "Paiement en",
    crypto_native_cancel_confirm_title: "Annuler cette facture ?",
    crypto_native_cancel_confirm_body:
      "L'adresse de paiement ne sera plus surveillée. N'y envoyez pas de fonds après l'annulation. Vous pouvez démarrer un nouveau paiement à tout moment.",
    crypto_native_hint_awaiting:
      "Nous surveillons le réseau automatiquement pour votre transaction.",
    crypto_native_hint_detected:
      "Votre transaction a atteint le réseau et attend d'être incluse dans un bloc.",
    crypto_native_hint_confirming:
      "En attente des confirmations du réseau. Votre offre s'active dès qu'elles sont terminées.",
    crypto_native_hint_confirming_addon:
      "En attente des confirmations du réseau. Votre option de stockage s’active dès qu’elles sont terminées.",
    crypto_native_hint_credited: "Confirmé. Votre offre est active.",
    crypto_native_hint_credited_addon:
      "Confirmé. Votre option de stockage est active.",
    crypto_native_time_remaining: "Temps restant",
    crypto_native_expiring_soon:
      "Moins de 5 minutes restantes. Si ce délai expire avant l'arrivée de votre paiement, vous pouvez en démarrer un nouveau au taux actuel.",
    crypto_native_hint_underpaid:
      "Envoyez le montant restant indiqué ci-dessus à la même adresse pour finaliser ce paiement.",
    crypto_native_hint_manual_review:
      "Notre équipe examine ce paiement. Aucune action de votre part n'est nécessaire.",
    crypto_native_connection_lost:
      "Connexion perdue. Nouvelle tentative automatique.",
    crypto_native_coins_unavailable:
      "Les options de paiement en cryptomonnaie n'ont pas pu être chargées.",
    crypto_native_copy_tx_hash: "Copier le hash de la transaction",
    crypto_native_expiry_progress:
      "Temps restant avant l'expiration de cette facture",
    crypto_native_confirmations_progress: "Confirmations réseau",
    crypto_modal_price: "Montant : {{amount}}",
    crypto_modal_title: "Paiement en cryptomonnaie",
    crypto_no_renew_notice: "Ce forfait ne se renouvelle pas automatiquement.",
    crypto_paid_until: "Payé jusqu'au {{date}} (crypto)",
    crypto_pay_button: "Payer avec de la crypto",
    crypto_summary_plan: "Offre",
    crypto_summary_addon: "Option",
    crypto_summary_length: "Durée",
    crypto_pay_now: "Payer maintenant en crypto",
    crypto_renew_link: "Renouveler",
    crypto_select_term: "Sélectionner la durée",
    crypto_success_toast: "Paiement en crypto confirmé",
    crypto_term_12mo: "12 mois",
    crypto_term_1mo: "1 mois",
    crypto_term_24mo: "24 mois",
    crypto_term_3mo: "3 mois",
    crypto_term_6mo: "6 mois",
    custom_domains_suffix: "domaine(s) personnalisé(s)",
    delete_domain_cooldown:
      "Vous devez attendre avant de supprimer ce domaine.",
    delete_domain_warning: "La suppression de ce domaine est irréversible.",
    desktop_bridge_description:
      "Connectez des clients de messagerie tiers via IMAP/SMTP.",
    desktop_bridge_install_hint:
      "Installez le bridge de bureau pour utiliser des clients IMAP/SMTP.",
    desktop_bridge_set_up: "Configurer {{ client }}",
    bridge: "Bridge",
    bridge_description:
      "Connectez Aster à n’importe quel client de messagerie IMAP ou SMTP",
    bridge_download_windows: "Télécharger pour Windows",
    bridge_download_msi: "MSI",
    bridge_app_name: "Aster Bridge",
    bridge_windows_name: "Windows",
    bridge_windows_desc:
      "Téléchargez le programme d’installation et lancez Aster Bridge sur votre ordinateur Windows.",
    bridge_linux_name: "Linux",
    bridge_linux_desc:
      "Paquets AppImage, .deb et .rpm disponibles pour les principales distributions.",
    bridge_linux_cta: "Télécharger l’AppImage",
    bridge_linux_deb_link: ".deb",
    bridge_linux_rpm_link: ".rpm",
    bridge_linux_pacman_link: "Arch Linux",
    bridge_linux_appimage_arm64_link: "AppImage (ARM64)",
    bridge_linux_deb_arm64_link: ".deb (ARM64)",
    bridge_linux_rpm_arm64_link: ".rpm (ARM64)",
    bridge_macos_name: "macOS",
    bridge_macos_desc:
      "Téléchargez le DMG universel pour les Mac Apple Silicon et Intel.",
    bridge_macos_cta: "Télécharger pour macOS",
    bridge_coming_soon: "Bientôt disponible",
    bridge_info_link: "En savoir plus",
    bridge_popover_description:
      "Un proxy local léger qui s'exécute sur votre bureau. Il déchiffre votre boîte aux lettres et la sert via IMAP et SMTP standard afin que n'importe quel client de messagerie puisse s'y connecter.",
    bridge_installations: "Installations connectées",
    bridge_installations_description:
      "Chaque entrée est une application Bridge associée à votre compte. La révoquer déconnecte tous les clients de messagerie utilisant cette installation.",
    bridge_installations_empty: "Aucune installation Bridge connectée.",
    bridge_revoke_title: "Révoquer l'installation ?",
    bridge_revoke_message:
      "Cela déconnectera {{ name }} et tous les clients de messagerie qui l'utilisent. Vous pouvez vous reconnecter en associant Bridge à nouveau.",
    bridge_revoke_all_message:
      "Cela déconnectera toutes les installations Bridge et tous les clients de messagerie qui les utilisent.",
    bridge_active_now: "Actuellement actif",
    bridge_support_title: "Besoin d'aide ?",
    bridge_support_description:
      "Obtenez de l'aide pour configurer Aster Bridge avec votre client de messagerie.",
    bridge_support_help: "Centre d'aide",
    bridge_support_discord: "Communauté Discord",
    bridge_support_x: "Suivre sur X",
    bridge_support_github: "GitHub",
    bridge_support_reddit: "Reddit",
    desktop_bridge_title: "Bridge de bureau",
    desktop_bridge_upgrade_cta: "Mettre à niveau",
    desktop_bridge_upgrade_description:
      "Le bridge de bureau est disponible avec les forfaits supérieurs.",
    desktop_bridge_upgrade_title: "Bridge de bureau - Mise à niveau requise",
    dev_active_count: "Actif : {{count}}",
    dev_checking: "Vérification...",
    dev_databases_count_one: "{{count}} base de données",
    dev_databases_count_other: "{{count}} bases de données",
    dev_days_ago: "Il y a {{count}} jour(s)",
    dev_encryption_label: "Chiffrement",
    dev_hours_ago: "Il y a {{count}} heure(s)",
    dev_key_exchange_label: "Échange de clés",
    dev_keys_count: "{{count}} clé(s)",
    dev_less_than_one_hour: "Moins d'une heure",
    dev_loaded_ago: "Chargé il y a {{time}}",
    dev_minutes_ago: "Il y a {{count}} minute(s)",
    dev_none: "Aucun",
    dev_none_registered: "Aucun enregistré",
    dev_password_kdf_label: "KDF du mot de passe",
    dev_seconds_ago: "Il y a {{count}} seconde(s)",
    dev_signatures_label: "Signatures",
    dev_unavailable: "Indisponible",
    dev_unknown: "Inconnu",
    dev_unregistered: "Non enregistré",
    dev_unsupported: "Non pris en charge",
    disconnect_button: "Déconnecter",
    disconnect_confirm: "Déconnecter ce compte ?",
    disconnect_delete_messages_label: "Supprimer les messages importés",
    disconnect_delete_messages_label_count:
      "Supprimer aussi ses {{ count }} e-mails importés",
    disconnect_success: "Compte déconnecté",
    disconnect_deleted_success:
      "Compte déconnecté, {{ count }} e-mails supprimés",
    disconnect_title: "Déconnecter le compte",
    discount_first_month: "Premier mois à prix réduit",
    discount_first_year: "Première année à prix réduit",
    dkim_rotated: "Clé DKIM renouvelée",
    dkim_rotated_warning_body:
      "Mettez à jour l'enregistrement DKIM de votre domaine.",
    dkim_rotated_warning_title: "Renouvellement DKIM requis",
    domain_pending_hint: "La vérification DNS peut prendre jusqu'à 48 heures.",
    domain_placeholder: "exemple.com",
    downgrade_scheduled: "Rétrogradation planifiée",
    email_aliases_suffix: "alias e-mail",
    email_label: "E-mail",
    encrypted_storage_suffix: "de stockage chiffré",
    error_tip_dkim:
      "Vérifiez votre enregistrement DKIM dans les paramètres DNS.",
    error_tip_dmarc: "Ajoutez un enregistrement DMARC à votre domaine.",
    error_tip_mx: "Vérifiez vos enregistrements MX.",
    error_tip_spf: "Vérifiez votre enregistrement SPF.",
    error_tip_txt: "Vérifiez votre enregistrement TXT de vérification.",
    export: "Exporter",
    export_cancel: "Annuler l'exportation",
    export_complete_bytes: "{{bytes}} exportés",
    export_complete_errors: "{{count}} erreur(s)",
    export_complete_skipped_undecryptable:
      "{{ count }} message(s) n'ont pas pu être déchiffrés et ne figurent pas dans cette archive.",
    export_complete_skipped_attachments:
      "{{ count }} pièce(s) jointe(s) n'ont pas pu être déchiffrées et ne figurent pas dans cette archive.",
    export_complete_errors_in_mbox_hint: "Certains messages ont été ignorés.",
    export_complete_location: "Enregistre dans : {{location}}",
    export_cancelled_partial_saved:
      "Exportation annulée. Fichier partiel conservé à {{ location }}.",
    export_complete_summary:
      "{{ count }} message(s) exporté(s) sur {{ total }}.",
    export_description: "Exportez vos e-mails, contacts et paramètres.",
    export_destination_chosen: "Enregistrement vers : {{ location }}",
    export_destination_fallback_notice:
      "L'exportation sera enregistrée dans votre dossier Téléchargements.",
    export_destination_pick_file: "Choisir un fichier",
    export_destination_pick_folder: "Choisir un dossier",
    export_error_no_messages_match: "Aucun message ne correspond aux critères.",
    export_error_no_vault: "Coffre-fort non disponible",
    export_error_write_fatal: "Erreur d'écriture fatale",
    export_format_eml_hint: "Un fichier par e-mail",
    export_format_eml_name: "Fichiers EML",
    export_format_mbox_hint:
      "Compatible avec la plupart des clients de messagerie",
    export_format_mbox_name: "Format MBOX",
    export_progress_bytes_written: "{{bytes}} écrits",
    export_progress_working: "Préparation de votre exportation.",
    export_progress_current_folder: "Dossier actuel : {{folder}}",
    export_progress_eta: "Environ {{duration}} restant",
    export_progress_messages: "{{processed}} sur {{total}} messages",
    export_rate_limited_paused: "Exportation suspendue - limite atteinte",
    export_reauth_failed: "Vérification échouée",
    export_step_verify_title: "Vérifiez votre identité",
    export_verify_description:
      "Confirmez le mot de passe de votre compte avant de préparer cet export.",
    export_verify_submit: "Vérifier",
    export_security_section_title: "Vérification requise",
    export_security_password_row_title: "Mot de passe du compte et 2FA",
    export_security_password_row_body:
      "Vous confirmerez votre mot de passe, et votre code d'authentification si la 2FA est activée, avant chaque export.",
    export_security_vault_row_title: "Phrase secrète du coffre de chiffrement",
    export_security_vault_row_body:
      "Votre phrase secrète locale du coffre confirme cet appareil avant que le courrier ne soit déchiffré pour l'export.",
    export_security_vault_row_help:
      "Il s'agit de la phrase secrète du coffre local de cet appareil, pas de votre mot de passe de compte. Elle déverrouille vos clés de chiffrement uniquement sur cet appareil.",
    export_security_required_badge: "Requis",
    export_reauth_prompt: "Entrez votre mot de passe pour continuer",
    export_reauth_submit: "Vérifier",
    export_scope_contacts_body: "Exporter tous vos contacts",
    export_scope_mail_help:
      "MBOX regroupe tous les messages dans un seul fichier ; .EML enregistre chaque message séparément. Les deux formats fonctionnent avec la plupart des clients de messagerie de bureau.",
    export_scope_contacts_title: "Contacts",
    export_scope_date_range: "Plage de dates",
    export_scope_date_from: "Du",
    export_scope_date_to: "Au",
    export_scope_empty_warning: "Aucun élément sélectionné pour l'exportation.",
    export_scope_folders_label: "Dossiers",
    export_scope_labels_label: "Étiquettes",
    export_scope_mail_body: "Exporter tous vos e-mails",
    export_scope_mail_title: "E-mails",
    export_scope_preset_all: "Tout",
    export_scope_preset_custom: "Personnalisé",
    export_scope_settings_body: "Exporter vos préférences",
    export_scope_contacts_help:
      "vCard 4.0 est le format de contact universel importé directement par la plupart des applications. Le fichier JSON supplémentaire conserve les champs que vCard ne peut pas stocker.",
    export_scope_settings_title: "Paramètres",
    export_start_button: "Démarrer l'exportation",
    export_step_complete_title: "Exportation terminée",
    export_step_incomplete_title: "L'exportation ne s'est pas terminée",
    export_incomplete_summary:
      "{{ count }} messages sur {{ total }} ont été exportés avant l'arrêt de l'exportation.",
    export_complete_data_only: "Votre exportation est prête.",
    export_step_destination_title: "Destination",
    export_step_format_title: "Format d'exportation",
    export_step_progress_title: "Exportation en cours",
    export_step_reauth_title: "Vérification requise",
    export_step_scope_title: "Que souhaitez-vous exporter ?",
    export_title: "Exporter vos données",
    export_warning_body:
      "L'exportation peut prendre du temps selon la taille de votre boîte aux lettres.",
    export_warning_confirm: "Continuer",
    export_warning_title: "Avant d'exporter",
    external_accounts_tab: "Comptes externes",
    f_auto_forward: "Transfert automatique",
    f_e2ee: "Chiffrement de bout en bout",
    f_folder_lock: "Verrouillage de dossier",
    f_tracker_protection_long: "Protection contre le suivi",
    f_zero_knowledge: "Connaissance nulle",
    failed_create_import_job: "Échec de la création du travail d'importation",
    failed_to_load_allowlist: "Échec du chargement de la liste autorisée",
    failed_to_load_blocklist: "Échec du chargement de la liste bloquée",
    feature_tracker_protection: "Protection contre le suivi",
    ghost_alias_active: "Actif",
    ghost_alias_expire_now: "Faire expirer maintenant",
    ghost_alias_max_extension_toast:
      "Cet alias fantôme a atteint sa durée de vie maximale de 90 jours et ne peut plus être prolongé.",
    ghost_alias_expire_confirm_title: "Faire expirer cet alias fantôme ?",
    ghost_alias_expire_confirm_message_named:
      "Voulez-vous vraiment faire expirer {{address}} ? Vous ne pourrez pas le récupérer. Son délai de grâce court jusqu'au {{date}}.",
    delete_aliases_confirmation_count:
      "Voulez-vous vraiment supprimer {{count}} alias ? Cette action est irréversible.",
    delete_alias_confirmation_named:
      "Voulez-vous vraiment supprimer {{address}} ? Cette action est irréversible.",
    delete_address_confirmation_named:
      "Voulez-vous vraiment supprimer {{address}} ? Cette action est irréversible.",
    alias_directory_delete_title: "Supprimer le répertoire",
    alias_directory_delete_message:
      "Voulez-vous vraiment supprimer le répertoire {{address}} ? Les messages envoyés aux nouvelles adresses de ce modèle n'arriveront plus. Les alias déjà créés continuent de fonctionner.",
    ghost_alias_expire_confirm_message:
      "Voulez-vous vraiment faire expirer cet alias ? Vous ne pourrez pas le récupérer. Son délai de grâce durera jusqu'au {{date}}.",
    ghost_alias_expired_grace: "Expiré - période de grâce",
    ghost_alias_expires_in: "Expire dans {{days}} jour(s)",
    ghost_alias_extend: "Prolonger",
    ghost_alias_grace_until: "Période de grâce jusqu'au {{date}}",
    ghost_aliases_description:
      "Des alias temporaires qui expirent automatiquement.",
    ghost_aliases_empty: "Aucun alias fantôme actif.",
    ghost_aliases_compose_cta: "Composer en Mode Fantôme",
    ghost_aliases_this_month: "{{ count }} ce mois-ci",
    ghost_aliases_title: "Alias fantômes",
    images_section_title: "Images",
    import_delete_confirm_description: "Cette action est irréversible.",
    import_delete_confirm_title: "Supprimer cette importation ?",
    import_folder_prep_status:
      "Préparation des dossiers... ({{ done }}/{{ total }})",
    import_source_csv: "Fichier CSV",
    import_source_eml: "Fichiers EML",
    import_source_gmail: "Gmail",
    import_source_mbox: "Fichier MBOX",
    import_source_outlook: "Outlook",
    import_source_pst: "Fichier PST",
    import_stage_cancel: "Annuler",
    import_stage_importing_emails: "Importation des e-mails...",
    import_stage_setting_up_folders: "Configuration des dossiers...",
    import_status_cancelled: "Annulé",
    import_status_completed: "Terminé",
    import_status_failed: "Échoué",
    import_status_pending: "En attente",
    import_status_processing: "En cours",
    instructions_for_provider: "Instructions pour {{provider}}",
    invoice_status_disputed: "Contesté",
    invoice_status_draft: "Brouillon",
    invoice_status_failed: "Échoué",
    invoice_status_open: "Ouvert",
    invoice_status_paid: "Payé",
    invoice_status_pending: "En attente",
    invoice_status_refunded: "Remboursé",
    invoice_status_reversed: "Annulé",
    invoice_status_uncollectible: "Irrécouvrable",
    invoice_status_void: "Annulé",
    invoice_status_voided: "Invalidé",
    key_name_placeholder: "Nom de la clé",
    key_source_autocrypt: "Autocrypt",
    key_source_cached: "En cache",
    key_source_dane: "DANE",
    key_source_keyserver: "Serveur de clés",
    key_source_unknown: "Inconnu",
    key_source_wkd: "WKD",
    last_used: "Derniere utilisation",
    mail_rules_suffix: "règle(s) de messagerie",
    n_minutes: "{{count}} minute(s)",
    n_skipped: "{{count}} ignoré(s)",
    name_your_key: "Nommez votre clé",
    navigation_panel: "Panneau de navigation",
    need_help_link: "Besoin d'aide ?",
    never_used: "Jamais utilisé",
    newest_first: "Plus récents en premier",
    no_security_keys: "Aucune clé de sécurité enregistrée.",
    security_keys_desktop_note:
      "Les clés de sécurité peuvent être ajoutées dans l'application web Aster sur app.astermail.org. Vous pouvez toujours consulter et supprimer les clés existantes ici.",
    passkeys_desktop_note:
      "Les clés d'accès peuvent être ajoutées dans l'application web Aster sur app.astermail.org. Vous pouvez toujours consulter et supprimer les clés d'accès existantes ici.",
    app_lock_pin: "Verrouillage par code PIN",
    app_lock_pin_description:
      "Exige un code PIN pour ouvrir Aster Mail dans le navigateur",
    app_lock_choose_digits: "Choisir la longueur du PIN",
    app_lock_digits_4: "4 chiffres",
    app_lock_digits_6: "6 chiffres",
    app_lock_digits_8: "8 chiffres",
    app_lock_set_pin: "Définir le PIN",
    app_lock_confirm_pin: "Confirmer le PIN",
    app_lock_pin_mismatch: "Les codes PIN ne correspondent pas. Réessayez.",
    app_lock_enabled_toast: "Verrouillage activé",
    app_lock_disabled_toast: "Verrouillage désactivé",
    app_lock_change_pin: "Modifier le PIN",
    app_lock_enter_to_disable:
      "Entrez votre PIN pour désactiver le verrouillage",
    app_lock_enter_to_change: "Entrez votre PIN actuel pour continuer",
    app_lock_wrong_pin: "Code PIN incorrect",
    app_lock_locked_out_for: "Trop de tentatives - réessayez dans {{s}}s",
    vanguard_title: "Aster Vanguard",
    vanguard_description: "Nova+ uniquement. Plus de fonctionnalités bientôt.",
    vanguard_info:
      "Aster Vanguard active des fonctionnalités de sécurité avancées pour les journalistes, avocats et personnes à risque élevé. Comprend le verrouillage par code PIN, des contrôles de session renforcés et plus encore.",
    vanguard_active: "Vanguard Actif",
    vanguard_learn_more: "En savoir plus",
    vanguard_enable: "Activer Vanguard",
    vanguard_disable: "Désactiver Vanguard",
    vanguard_requires_nova: "Nécessite le plan Nova ou supérieur",
    vanguard_upgrade_cta: "Passer à Nova",
    vanguard_what_you_get: "Ce que vous obtenez :",
    vanguard_feature_app_lock: "Verrouillage par PIN",
    vanguard_feature_app_lock_desc:
      "Verrouillez l'app avec un PIN quand vous vous éloignez",
    vanguard_feature_enhanced_monitoring: "Surveillance de sécurité renforcée",
    vanguard_feature_enhanced_monitoring_desc:
      "Protections supplémentaires pour votre compte",
    vanguard_confirm_disable_title: "Désactiver Aster Vanguard ?",
    vanguard_confirm_disable_desc:
      "Cela désactivera toutes les fonctionnalités Vanguard, y compris votre verrouillage par PIN. Vous pouvez le réactiver à tout moment.",
    vanguard_enabled_toast: "Aster Vanguard activé",
    vanguard_disabled_toast: "Aster Vanguard désactivé",
    lockdown_title: "Mode isolement",
    lockdown_description:
      "Bloque tout le contenu externe, supprime les aperçus dans les notifications, désactive la synchronisation en temps réel et demande confirmation avant d’ouvrir un lien. Aucune dérogation n’est possible tant qu’il est actif.",
    lockdown_active: "Mode isolement actif",
    lockdown_enable: "Activer le mode isolement",
    lockdown_disable: "Désactiver le mode isolement",
    lockdown_enabled_toast: "Mode isolement activé",
    lockdown_disabled_toast: "Mode isolement désactivé",
    lockdown_confirm_disable_title: "Désactiver le mode isolement ?",
    lockdown_confirm_disable_desc:
      "Cela autorisera le contenu externe, le suivi des liens et les aperçus dans les notifications. Vous pourrez le réactiver à tout moment.",
    lockdown_notification_generic: "Nouveau message",
    lockdown_content_blocked_note: "Mode isolement actif",
    lockdown_link_warning_title: "Ouverture d’un lien externe",
    lockdown_link_warning_body: "Cela révélera votre adresse IP à :",
    lockdown_info:
      "Lockdown Mode closes every in-session data leak vector. External images, fonts, and CSS are blocked with no bypass.",
    lockdown_badge: "Isolement",
    lockdown_must_disable_first:
      "Désactivez le mode isolement avant de désactiver Vanguard.",
    oauth_folders_error: "Erreur lors de la configuration des dossiers",
    oauth_folders_partial:
      "{{count}} dossiers n'ont pas terminé leur configuration, les autres sont prêts à utiliser.",
    oauth_folders_ready: "Dossiers prêts",
    oauth_reason_account_creation_failed: "Échec de la création du compte",
    oauth_reason_email_not_found:
      "Nous n’avons pas pu récupérer votre adresse e-mail auprès du fournisseur. Réessayez ; si le problème persiste, utilisez l’option IMAP manuelle.",
    oauth_reason_session_expired:
      "La session de connexion a expiré. Réessayez.",
    oauth_reason_encryption_error: "Erreur de chiffrement",
    oauth_reason_expired_state: "Session expirée",
    oauth_reason_internal_error: "Erreur interne",
    oauth_reason_invalid_provider: "Fournisseur invalide",
    oauth_reason_invalid_state: "État invalide",
    oauth_reason_missing_code: "Code manquant",
    oauth_reason_missing_state: "État manquant",
    oauth_reason_provider_denied: "Accès refusé par le fournisseur",
    oauth_reason_provider_not_configured: "Fournisseur non configuré",
    oauth_reason_token_exchange_failed: "Échec de l'échange de jeton",
    oauth_reason_unknown: "Raison inconnue",
    oauth_setting_up_folders: "Configuration des dossiers...",
    oldest_first: "Plus anciens en premier",
    or_pay_with_card: "Ou payer par carte",
    password_breach_warning:
      "Ce mot de passe a été détecté dans une fuite de données.",
    finish_plan_setup_title:
      "Terminez la configuration de votre offre {{plan}}",
    finish_plan_setup_message:
      "Vous avez fermé le paiement avant de régler. Votre compte reste sur l'offre gratuite jusqu'à ce que vous terminiez.",
    finish_plan_setup_action: "Terminer la configuration",
    win_back_offer_title: "Votre {{discount}} vous attend",
    win_back_offer_expires_today: "C’est le dernier jour pour en profiter.",
    win_back_offer_expires_tomorrow: "Elle se termine demain.",
    win_back_offer_expires_in: "Elle se termine dans {{days}} jours.",
    win_back_offer_auto_applied:
      "La remise est déjà sur votre compte, le paiement l’applique pour vous. Code {{code}}.",
    win_back_offer_action: "Choisir une offre",
    payment_processing_delayed:
      "Le traitement du paiement peut prendre quelques minutes.",
    pdf: "PDF",
    per_two_years: "tous les deux ans",
    plan_f_alias_avatars: "Avatars d'alias",
    plan_f_mail_rules: "{{value}} filtres et regles de messagerie",
    plan_f_tracker_protection: "Protection contre le suivi",
    promo_forever: "Pour toujours",
    promo_once_reverts:
      "S'applique uniquement à votre {{period}}, puis revient à {{price}}{{interval}}",
    promo_then_reverts:
      "Puis revient a {{price}}{{interval}} apres {{months}} mois",
    provider_cf_add_mx: "Ajoutez l'enregistrement MX",
    provider_cf_add_record: "Ajoutez l'enregistrement DNS",
    provider_cf_add_txt_record: "Ajoutez l'enregistrement TXT",
    provider_cf_login: "Connectez-vous à Cloudflare",
    provider_cf_save: "Enregistrez les modifications",
    provider_cf_select_domain: "Sélectionnez votre domaine",
    provider_gd_add_mx: "Ajoutez l'enregistrement MX",
    provider_gd_add_record: "Ajoutez l'enregistrement DNS",
    provider_gd_add_txt: "Ajoutez l'enregistrement TXT",
    provider_gd_login: "Connectez-vous à GoDaddy",
    provider_gd_manage_dns: "Gérez votre DNS",
    provider_gd_save: "Enregistrez les modifications",
    provider_nc_add_mx: "Ajoutez l'enregistrement MX",
    provider_nc_add_record: "Ajoutez l'enregistrement DNS",
    provider_nc_add_txt: "Ajoutez l'enregistrement TXT",
    provider_nc_advanced_dns: "Accédez au DNS avancé",
    provider_nc_login: "Connectez-vous à Namecheap",
    provider_nc_save: "Enregistrez les modifications",
    reading_and_conversations: "Lecture et conversations",
    record_not_detected: "Enregistrement non détecté",
    academic_discount_title: "Réduction étudiants et journalistes",
    academic_discount_description:
      "30 % de réduction sur les forfaits individuels pour les étudiants et journalistes vérifiés.",
    academic_intro:
      "Vérifiez votre adresse e-mail universitaire pour recevoir un code de réduction personnel de 30 % sur les forfaits Star, Nova et Supernova.",
    academic_email_placeholder: "vous@universite.edu",
    academic_send_verification: "Envoyer la vérification",
    academic_sending: "Envoi...",
    academic_verification_sent:
      "E-mail de vérification envoyé. Consultez votre boîte universitaire.",
    academic_pending_title: "Vérification en attente",
    academic_pending_description:
      "Nous avons envoyé un lien de vérification à votre adresse universitaire. Le lien expire dans 24 heures.",
    academic_resend: "Renvoyer l'e-mail",
    academic_resend_cooldown: "Renvoyer dans {{ seconds }} s",
    academic_code_ready_title: "Votre code de réduction",
    academic_use_at_checkout:
      "Le code est appliqué automatiquement au paiement, ou saisissez-le manuellement.",
    academic_terms:
      "30 % de réduction pendant 12 mois sur les forfaits individuels. À utiliser sous 90 jours.",
    academic_verified_toast:
      "Adresse universitaire vérifiée. Votre code de réduction est prêt.",
    academic_failed_toast:
      "Échec de la vérification. Le lien a peut-être expiré - demandez-en un nouveau.",
    academic_invalid_email:
      "Utilisez une adresse universitaire (ex. .edu ou .ac.uk). Si votre université utilise un autre domaine, contactez le support.",
    academic_email_in_use:
      "Cette adresse universitaire est déjà utilisée pour une réduction.",
    academic_request_failed:
      "Impossible d'envoyer l'e-mail de vérification. Veuillez réessayer.",
    academic_copy_failed: "Impossible de copier le code.",
    academic_captcha_required: "Veuillez compléter le captcha.",
    academic_journalist_hint:
      "Journaliste ? Contactez le support avec votre carte de presse pour recevoir votre code.",
    refer_a_friend: "Parrainer un ami",
    referral_email_body:
      "Bonjour,\n\nJ'utilise Aster Mail depuis un moment et j'aime beaucoup. Tout est chiffré de bout en bout, donc personne ne peut lire vos e-mails à part vous. Pas même ceux qui gèrent le service.\n\nSi vous voulez essayer, voici mon lien d'invitation :\n\n{{ referral_link }}\n\nNous recevons chacun {{ amount }} de stockage supplémentaire dès que vous commencez à l'utiliser, donc vous y gagnez aussi.\n\nÀ bientôt",
    referral_email_subject: "Rejoignez Aster Mail",
    referral_how_it_works: "Comment ça marche",
    referral_loading_contacts: "Chargement des contacts...",
    referral_no_contacts: "Aucun contact trouvé",
    referral_rewards: "Vos récompenses",
    referral_step_earn:
      "Vous recevez chacun {{ amount }} de stockage supplémentaire, jusqu'à {{ max }}.",
    referral_step_share:
      "Partagez votre lien d'invitation avec vos amis, votre famille ou vos collègues.",
    referral_step_signup:
      "Ils créent un compte avec votre lien et commencent à l'utiliser.",
    registered: "Enregistre",
    remote_image_loading: "Chargement des images distantes",
    remote_image_loading_description:
      "Contrôlez quand les images distantes sont chargées.",
    remote_images_always: "Toujours charger",
    remote_images_ask: "Demander",
    remote_images_never: "Ne jamais charger",
    remove_key: "Supprimer la clé",
    rotate_dkim_description:
      "Renouvelez votre clé DKIM pour améliorer la sécurité.",
    rotate_dkim_key: "Renouveler la clé DKIM",
    rotate_label: "Renouveler",
    security_key_registered: "Clé de sécurité enregistrée",
    security_key_removed: "Clé de sécurité supprimée",
    security_keys: "Clés de sécurité",
    security_keys_description:
      "Utilisez une clé physique pour sécuriser votre compte.",
    select_color: "Selectionner la couleur {{name}}",
    send_referral_to_contacts: "Envoyer un e-mail à tous les contacts",
    show_signature_separator: "Separateur de signature",
    show_signature_separator_description:
      "Ajouter une ligne de separation '--' au-dessus de votre signature dans les emails sortants.",
    show_aster_branding: "Afficher la marque Aster",
    show_aster_branding_description:
      "Afficher le logo Aster dans votre signature.",
    show_aster_branding_free_note:
      "La marque Aster est requise avec le forfait gratuit.",
    sidebar_width: "Largeur de la barre latérale",
    sidebar_width_description: "Ajustez la largeur de la barre latérale.",
    signature_alias: "Alias de signature",
    signature_alias_conflict_error: "Conflit avec un autre alias",
    signature_alias_default: "Alias par défaut",
    signature_alias_in_use: "En cours d'utilisation",
    signature_placement_inherit: "Hériter",
    smtp_host_placeholder: "smtp.exemple.com",
    spam_filter_enabled: "Filtre anti-spam activé",
    spam_filter_enabled_description: "Filtrer automatiquement les spams.",
    spam_settings_load_failed:
      "Vos paramètres de spam ne se sont pas chargés, donc ces valeurs peuvent ne pas correspondre à votre compte.",
    dev_mode_needs_unlock:
      "Déverrouillez votre coffre pour modifier le mode développeur.",
    translate_languages_keep_one:
      "Conservez au moins une langue pour la traduction.",
    spam_sensitivity_description: "Ajustez la sensibilité du filtre anti-spam.",
    status_active: "Actif",
    status_dns_pending: "DNS en attente",
    status_suspended: "Suspendu",
    status_verifying: "Vérification en cours",
    stop_sync_description: "Arrêter la synchronisation de ce compte externe.",
    stop_sync_title: "Arrêter la synchronisation",
    storage_format_ipfs_hint:
      "Stocké sur IPFS pour une résistance à la censure.",
    subscription_activated: "Abonnement activé",
    switch_billing_loss:
      "Passer à la facturation mensuelle vous coûtera {{amount}} de plus par an.",
    sync_15_min: "15 minutes",
    sync_1_hour: "1 heure",
    sync_2_hours: "2 heures",
    sync_30_min: "30 minutes",
    sync_5_min: "5 minutes",
    sync_6_hours: "6 heures",
    sync_progress_count: "{{processed}} sur {{total}} e-mails importes",
    sync_progress_preparing: "Préparation...",
    sync_checking_new: "Recherche de nouveaux messages…",
    sync_result_imported: "{{ count }} nouveaux e-mails importés",
    sync_result_up_to_date: "Déjà à jour - aucun nouvel e-mail",
    sync_stopped: "Synchronisation arrêtée",
    purging_progress:
      "Suppression des e-mails importés… {{ current }} sur {{ total }}",
    purging_simple: "Suppression des e-mails importés…",
    time_format_12h: "12 heures (AM/PM)",
    time_format_24h: "24 heures",
    tracking_protection_enabled: "Protection contre le suivi activée",
    tracking_protection_enabled_description:
      "Les liens de suivi et les pixels espions seront bloqués.",
    tracking_protection_title: "Protection contre le suivi",
    trusted_2fa_description:
      "Ces sessions ont contourné la vérification en deux étapes.",
    trusted_2fa_empty: "Aucune session vérifiée en deux étapes.",
    trusted_2fa_expires: "Expire {{when}}",
    trusted_2fa_last_used: "Derniere utilisation : {{when}}",
    trusted_2fa_revoke: "Révoquer",
    trusted_2fa_revoke_all: "Tout révoquer",
    trusted_2fa_revoke_confirm:
      "Cet appareil devra fournir un code de verification lors de la prochaine connexion.",
    trusted_2fa_revoke_all_confirm:
      "Tous les appareils approuves devront fournir un code de verification lors de la prochaine connexion.",
    trusted_2fa_revoked_all_toast: "Toutes les sessions vérifiées révoquées",
    trusted_2fa_revoked_toast: "Session révoquée",
    trusted_2fa_title: "Sessions vérifiées en deux étapes",
    trusted_devices: "Appareils de confiance",
    trusted_devices_created: "Jumelé",
    trusted_devices_description:
      "Gérez les appareils autorisés à accéder à votre compte sans vérification en deux étapes.",
    trusted_devices_empty: "Aucun appareil de confiance enregistré.",
    trusted_devices_last_seen: "Derniere activite",
    trusted_devices_never: "Jamais",
    trusted_devices_revoke: "Révoquer",
    trusted_devices_revoke_all: "Tout révoquer",
    trusted_devices_revoke_all_confirm:
      "Révoquer tous les appareils de confiance ?",
    trusted_devices_revoked_all_toast: "Tous les appareils ont été révoqués",
    trusted_devices_revoke_confirm: "Révoquer {{ name }} ?",
    two_factor_auth_disabled: "Authentification à deux facteurs désactivée",
    upgrade: "Mettre à niveau",
    upgrade_buy_storage: "Acheter du stockage",
    upgrade_generic_resource:
      "Mettre à niveau pour accéder à cette fonctionnalité",
    upgrade_inline_card_description:
      "Débloquez des fonctionnalités supplémentaires avec une mise à niveau.",
    upgrade_inline_card_title: "Mettre à niveau",
    upgrade_modal_description_generic:
      "Passez à un forfait supérieur pour accéder à cette fonctionnalité.",
    upgrade_modal_description_specific:
      "Vous avez atteint la limite {{resource}} sur le forfait {{plan}}. Passez a un forfait superieur pour en debloquer davantage.",
    upgrade_modal_title: "Mettre à niveau votre forfait",
    upgrade_perk_aliases: "Plus d'alias",
    upgrade_perk_domains: "Domaines personnalisés",
    upgrade_perk_features: "Fonctionnalités avancées",
    upgrade_perk_storage: "Plus de stockage",
    upgrade_view_plans: "Voir les forfaits",
    usage_contacts: "contacts",
    usage_filters: "filtres",
    usage_custom_categories: "catégories personnalisées",
    username_placeholder: "nom d'utilisateur",
    vacation_n_replies_sent: "{{count}} réponses envoyées",
    vacation_one_reply_sent: "1 réponse automatique envoyée",
    vacation_reply_count_one: "{{count}} réponse envoyée",
    vacation_reply_count_other: "{{count}} réponses envoyées",
    vacation_reply_last: "Dernière réponse : {{date}}",
    vacation_reply_tab_label: "Réponse automatique",
    vault_recovery_button: "Récupérer le coffre-fort",
    vault_recovery_description:
      "Récupérez l'accès à vos données chiffrées avec votre ancien mot de passe.",
    vault_recovery_enter_password: "Entrez votre mot de passe",
    vault_recovery_failed: "Échec de la récupération du coffre-fort",
    vault_recovery_known_aliases_hint:
      "Entrez vos alias pour faciliter la récupération.",
    vault_recovery_known_aliases_label: "Alias connus",
    vault_recovery_modal_description:
      "Entrez votre ancien mot de passe pour récupérer vos données.",
    vault_recovery_old_password_label: "Ancien mot de passe",
    vault_recovery_old_password_placeholder: "Votre ancien mot de passe",
    vault_recovery_recover_button: "Récupérer",
    vault_recovery_recovering: "Récupération en cours...",
    vault_recovery_success: "Coffre-fort récupéré avec succès",
    vault_recovery_title: "Récupération du coffre-fort",
    verify_all_records: "Vérifier tous les enregistrements",
    view_dns_records: "Voir les enregistrements DNS",
    search_placeholder: "Rechercher dans les réglages...",
    theme_sync_across_devices: "Synchroniser le thème entre les appareils",
    theme_sync_across_devices_description:
      "Désactivez cette option pour conserver un thème différent sur cet appareil.",
    product_updates: "Nouveautés du produit",
    product_updates_description:
      "Recevez un message quand Aster publie une mise à jour notable",
    product_updates_info:
      "Les annonces de sécurité et de politique arrivent toujours, même lorsque cette option est désactivée. Aster n’enregistre pas si vous ouvrez ces messages ni si vous cliquez dedans.",
    product_updates_turned_off:
      "Les nouveautés du produit sont désactivées. Vous pouvez les réactiver ici.",
    product_updates_save_failed:
      "Votre préférence de nouveautés n’a pas été enregistrée. Réessayez.",
    criterion_passkey: "Clé d’accès enregistrée",
    criterion_read_receipts_off: "Accusés de lecture désactivés",
    send_read_receipts_label: "Envoyer des accusés de lecture",
    send_read_receipts_description:
      "Indiquez aux expéditeurs quand vous ouvrez leurs messages.",
    alias_captcha_required: "Complétez le captcha pour créer un alias.",
    obscure_subject_title: "Masquer l’objet des e-mails chiffrés",
    obscure_subject_description:
      "Remplace l’objet visible par trois points lorsqu’un message est chiffré et transporte l’objet réel dans la partie chiffrée",
    info_obscure_subject_title: "Masquer l’objet des e-mails chiffrés",
    info_obscure_subject_description:
      "Les objets circulent normalement en clair : toute personne qui achemine le message peut les lire. Lorsque cette option est activée, un message chiffré part avec trois points à la place de l’objet, et l’objet réel est protégé dans la partie chiffrée. Les destinataires dont l’app de messagerie prend en charge les en-têtes protégés voient l’objet réel. Les autres voient trois points dans leur liste et retrouvent l’objet en haut du message : activez cette option seulement si ce compromis vous convient.",
    browse_folder: "Choisir un dossier",
    money_back_guarantee: "Garantie satisfait ou remboursé de 30 jours",
    cancel_anytime: "Annulez à tout moment",
    billed_annually: "facturé chaque année",
    save_annually_hint: "Économisez 20 % avec l’offre annuelle",
    billing_checkout_cancelled:
      "Paiement annulé. Votre compte est intact et rien n’a été débité : vous pouvez réessayer quand vous voulez depuis les Réglages.",
    upgrade_resume_title: "Finalisez votre abonnement",
    upgrade_resume_description:
      "Vous avez quitté le paiement avant de payer. Reprenez là où vous vous êtes arrêté.",
    referral_your_discount: "Votre remise",
    referral_discount_active: "Actif",
    referral_discount_redeemed: "Utilisée",
    referral_discount_expired: "Expirée",
    referral_discount_auto_apply:
      "Appliquée automatiquement au paiement, sans code à saisir.",
    referral_discount_expires: "Expire le {{ date }}",
    invite_storage_line:
      "Vous recevez chacun {{ amount }} de stockage supplémentaire",
    invite_storage_note:
      "Créez votre compte gratuit avec ce lien. Le stockage arrive sur les deux comptes dès que vous commencez à utiliser le vôtre.",
    invite_discount_note:
      "Et {{ percent }}% de réduction si vous passez un jour à une offre payante.",
    invite_cta_create_account_storage: "Créer mon compte gratuit",
    invite_friends: "Inviter des amis",
    invite_sidebar_earned: "{{ amount }} obtenus",
    referral_storage_headline:
      "Obtenez {{ amount }} de stockage pour chaque ami qui vous rejoint",
    referral_storage_subhead:
      "Votre ami reçoit aussi {{ amount }}. Le stockage arrive dès qu'il commence à utiliser son compte, jusqu'à {{ max }}.",
    referral_storage_earned_badge: "{{ amount }} obtenus",
    referral_active_referrals: "Actives",
    referral_share_button: "Partager l'invitation",
    referral_show_qr: "Afficher le code QR",
    referral_hide_qr: "Masquer le code QR",
    referral_qr_hint:
      "Pointez l'appareil photo d'un téléphone vers ce code pour ouvrir l'invitation.",
    referral_qr_alt: "Code QR de votre lien d'invitation Aster Mail",
    referral_share_title: "Rejoignez-moi sur Aster Mail",
    referral_share_message:
      "J'utilise Aster Mail pour un e-mail chiffré de bout en bout. Inscrivez-vous avec mon lien et nous recevons chacun {{ amount }} de stockage supplémentaire.",
    referral_shared: "Invitation partagée",
    referral_message_copied: "Message d'invitation copié",
    referral_bonus_gauge_label: "Stockage obtenu",
    referral_bonus_max: "Maximum : {{ value }}",
    referral_status_active: "Active",
    referral_email_all_contacts_hint:
      "Envoie un message à chaque contact de votre carnet d'adresses.",
    referral_claim_title: "Vous avez été invité ?",
    referral_claim_description:
      "Saisissez le code de votre invitation et vous recevrez chacun {{ amount }} de stockage supplémentaire. Vous avez jusqu'au {{ date }} pour l'ajouter.",
    referral_claim_placeholder: "Code d'invitation",
    referral_claim_button: "Ajouter le code",
    referral_claim_success:
      "Invitation ajoutée. Votre stockage arrive après quelques jours d'utilisation d'Aster Mail.",
    referral_claim_invalid: "Ce code d'invitation n'est pas valide.",
    referral_claim_window_closed:
      "Le délai pour ajouter un code d'invitation à ce compte est écoulé.",
    referral_claim_already: "Ce compte est déjà associé à une invitation.",
    referral_claim_self:
      "Vous ne pouvez pas utiliser votre propre code d'invitation.",
    domain_purchase_not_released:
      "L’achat de domaines n’est pas encore disponible. Il arrive dans une prochaine mise à jour.",
    domain_step_ownership_title: "Prouvez que ce domaine vous appartient",
    domain_step_mx_title: "Recevez des e-mails sur votre domaine",
    domain_step_spf_title: "Autorisez Aster à envoyer des e-mails en votre nom",
    domain_step_dkim_title: "Signez les e-mails que vous envoyez",
    domain_step_dmarc_title: "Empêchez les autres de se faire passer pour vous",
    domain_step_tlsrpt_title: "Recevez des rapports d’échec de chiffrement",
    domain_health_ok_title: "{{domain}} fonctionne",
    domain_health_ok_body:
      "Vous pouvez envoyer et recevoir des e-mails sur ce domaine, et vos messages sont signés pour arriver en boîte de réception.",
    domain_health_warning_title:
      "Les e-mails fonctionnent, mais risquent d’arriver en indésirables",
    domain_health_warning_body:
      "Vous recevez des e-mails sur ce domaine. Terminez les points ci-dessous pour que vos messages envoyés soient approuvés.",
    domain_health_critical_title: "Vous ne recevez pas d’e-mails",
    domain_health_critical_body:
      "Les e-mails envoyés à ce domaine n’arrivent pas jusqu’à Aster. Corrigez le point ci-dessous et la distribution reprend en quelques minutes.",
    domain_health_unknown_title: "Nous n’avons pas pu lire votre DNS",
    domain_health_unknown_body:
      "Cela signifie généralement que les enregistrements viennent d’être modifiés et ne se sont pas encore propagés. Nous continuons à vérifier.",
    domain_health_recheck: "Vérifier maintenant",
    domain_health_checking: "Vérification",
    domain_health_last_checked: "Dernière vérification à {{when}}",
    domain_health_auto_checking:
      "Nouvelle vérification automatique toutes les quelques secondes",
    domain_check_mx_label: "Réception des e-mails",
    domain_check_spf_label: "Autorisation d’envoi",
    domain_check_dkim_label: "Signature des messages",
    domain_check_dmarc_label: "Protection contre l’usurpation",
    domain_check_mx_pass:
      "Les e-mails envoyés à ce domaine arrivent dans votre boîte de réception Aster.",
    domain_check_spf_pass:
      "Les autres fournisseurs acceptent les e-mails qu’Aster envoie pour vous.",
    domain_check_dkim_pass:
      "Vos e-mails sortants sont signés, ils ne sont donc pas considérés comme falsifiés.",
    domain_check_dmarc_pass:
      "Personne d’autre ne peut envoyer d’e-mails en se faisant passer pour votre domaine.",
    domain_check_unknown:
      "Nous n’avons pas encore pu lire cet enregistrement. Vérification en cours.",
    domain_check_generic_failure:
      "Cet enregistrement n’est pas encore correctement configuré. Ajoutez l’enregistrement ci-dessous pour résoudre le problème.",
    domain_reason_mx_missing:
      "Personne ne peut encore vous écrire. Votre domaine n’a aucune route de messagerie, les messages reviennent donc à l’expéditeur.",
    domain_reason_mx_points_elsewhere:
      "Les e-mails partent vers votre ancien fournisseur, pas vers Aster. Supprimez les anciens enregistrements MX pour que les messages arrivent dans cette boîte.",
    domain_reason_spf_missing:
      "Vos e-mails risquent d’être rejetés ou marqués comme indésirables, car rien n’indique aux autres fournisseurs qu’Aster peut envoyer pour vous.",
    domain_reason_spf_missing_include:
      "Votre domaine a déjà un enregistrement SPF, mais il ne mentionne pas Aster. Ajoutez-y Aster, sinon vos e-mails risquent d’être rejetés.",
    domain_reason_spf_duplicate_records:
      "Vous avez plusieurs enregistrements SPF. Les fournisseurs les ignorent tous : fusionnez-les en un seul enregistrement.",
    domain_reason_dkim_missing_or_stale:
      "Vos e-mails sortants ne sont pas signés et semblent donc falsifiés. Ajoutez l’enregistrement de signature pour qu’ils soient approuvés.",
    domain_reason_dmarc_missing:
      "N’importe qui peut envoyer des e-mails en se faisant passer pour votre domaine. Ajoutez cet enregistrement une fois les deux précédents en place.",
    domain_fix_show_record: "Afficher l’enregistrement à ajouter",
    domain_fix_hide_record: "Masquer l’enregistrement",
    domain_provider_detected: "Votre DNS est géré par {{provider}}",
    domain_provider_open: "Ouvrir {{provider}}",
    crypto_rate_notice:
      "Lorsque vous choisissez une cryptomonnaie, nous bloquons un taux de change et vous indiquons le montant exact à envoyer. Le taux tient 60 minutes sur Bitcoin et Monero, et 30 minutes sur les réseaux Ethereum. Rien ne vous est prélevé tant que vous n’envoyez pas le paiement vous-même.",
    crypto_exchange_warning:
      "Payez depuis un portefeuille que vous contrôlez. Si vous envoyez des fonds depuis une plateforme d'échange ou un service de conversion, le paiement provient d'une adresse qui n'est pas la vôtre et le prestataire ne peut pas le rattacher à votre commande. Effectuez le paiement dans le délai indiqué sur la page de paiement.",
    crypto_energy_toggle: "Consommation d’énergie de ces réseaux",
    crypto_energy_btc:
      "Bitcoin : entre 700 et 1 400 kWh estimés par transaction. Source : Cambridge Bitcoin Electricity Consumption Index, 2026.",
    crypto_energy_eth:
      "Ethereum : entre 0,01 et 0,05 kWh estimés par transaction, et les réseaux qui y règlent leurs transactions, comme Base, consomment encore moins. Source : Ethereum Foundation, citant CCRI, 2026.",
    crypto_energy_l2:
      "Les réseaux qui regroupent les transactions et les règlent ensemble sur Ethereum, comme Base, consomment nettement moins qu’une transaction sur le réseau principal Ethereum. Nous n’avons pas de source primaire que nous soutiendrions pour un chiffre unique, nous n’en publions donc aucun.",
    crypto_energy_xmr:
      "Monero : preuve de travail, minée sur des processeurs génériques. Nous n’avons pas trouvé de chiffre actuel que nous soutiendrions, nous n’en publions donc aucun.",
    crypto_energy_caveat:
      "Ce sont des estimations de tiers et non nos propres mesures, et les chiffres par transaction sont contestés. Nous ne formulons aucune allégation environnementale sur les moyens de paiement.",
    crypto_native_rate_value: "Taux appliqué : 1 {{coin}} = {{rate}}",
    crypto_native_commit_notice:
      "Choisissez une cryptomonnaie pour bloquer votre taux de change. Vous envoyez ensuite le paiement vous-même depuis votre propre portefeuille.",
    feature_1000_emails: "1 000 e-mails",
    fam_kids_tab: "Enfants",
    fam_kids_title: "Adresses réservées pour les enfants",
    fam_kids_subtitle:
      "Réservez dès maintenant une adresse pour votre enfant et laissez-le terminer la configuration plus tard avec son propre mot de passe.",
    fam_kids_seats_used:
      "{{used}} place(s) familiale(s) utilisée(s) sur {{max}}",
    fam_kids_reserve_btn: "Réserver une adresse",
    fam_kids_seats_full:
      "Votre groupe familial est complet. Libérez une place pour réserver une autre adresse.",
    fam_kids_empty: "Aucune adresse réservée pour l’instant.",
    fam_kids_username_label: "Adresse",
    fam_kids_username_ph: "son nom d’utilisateur",
    fam_kids_info_title: "Adresses réservées aux enfants",
    fam_kids_info_desc:
      "L’adresse est réservée à votre enfant et bloquée pour tout le monde. Votre enfant (ou vous) termine la configuration plus tard avec un mot de passe privé, ce qui crée un vrai compte à accès zéro rattaché automatiquement à votre famille.",
    fam_kids_nickname_label: "Surnom (facultatif)",
    fam_kids_nickname_ph: "par exemple, Louis",
    fam_kids_storage_label: "Stockage pour cette adresse",
    fam_kids_checking: "Vérification de la disponibilité...",
    fam_kids_available: "Disponible",
    fam_kids_taken: "Déjà pris",
    fam_kids_reserved_taken: "Déjà réservé",
    fam_kids_invalid: "Nom d’utilisateur non valide",
    fam_kids_consent_label:
      "Je confirme être le parent ou le tuteur légal de cet enfant et je consens à la création d’un compte pour lui.",
    fam_kids_consent_required:
      "Confirmez le consentement parental pour continuer.",
    fam_kids_link_hint:
      "Toute personne disposant du lien peut configurer cette adresse. Ne le partagez qu’avec votre enfant et régénérez-le en cas de fuite.",
    fam_kids_create: "Réserver",
    fam_kids_creating: "Réservation...",
    fam_kids_cancel: "Annuler",
    fam_kids_created: "Adresse réservée · lien copié",
    fam_kids_address_reserved: "Adresse réservée",
    fam_kids_create_failed: "Impossible de réserver cette adresse",
    fam_kids_copy_link: "Copier le lien de configuration",
    fam_kids_link_copied: "Lien de configuration copié",
    fam_kids_regenerate: "Régénérer le lien",
    fam_kids_regenerated: "Nouveau lien généré",
    fam_kids_setup_now: "Configurer maintenant",
    fam_kids_release: "Libérer",
    fam_kids_released: "Réservation libérée",
    fam_kids_release_confirm:
      "Libérer cette adresse réservée ? Elle redeviendra disponible pour tout le monde.",
    fam_kids_status_reserved: "Réservée",
    fam_kids_status_claimed: "Active",
    fam_kids_claimed_active: "Compte configuré et rattaché à votre famille",
    fam_kids_load_failed: "Impossible de charger les réservations",
    fam_kids_claim_setup_for: "Configuration de {{address}}",
    fam_kids_claim_intro:
      "Choisissez un mot de passe pour terminer la configuration de cette adresse familiale.",
    fam_kids_claim_invalid_title: "Ce lien n’est plus valide",
    fam_kids_claim_invalid_body:
      "Ce lien a expiré, a déjà été utilisé ou a été retiré. Demandez-en un nouveau au propriétaire de la famille.",
    fam_kids_claim_signed_in_title: "Vous êtes connecté à un autre compte",
    fam_kids_claim_signed_in_body:
      "Ce lien configure un nouveau compte enfant. Ouvrez-le dans une fenêtre de navigation privée ou copiez-le pour l’utiliser sur l’appareil de votre enfant.",
    fam_kids_release_modal_title: "Libérer cette adresse ?",
    fam_kids_release_modal_body:
      "{{address}} redeviendra disponible à l’inscription pour tout le monde. Cette action est irréversible.",
    fam_kids_release_btn: "Libérer",
    fam_org_event_address_reserved: "Adresse réservée",
    fam_org_event_reservation_released: "Réservation libérée",
    fam_org_event_shared_mailbox_created: "Boîte partagée créée",
    fam_org_event_shared_mailbox_deleted: "Boîte partagée supprimée",
    fam_org_event_shared_mailbox_grant_added:
      "Accès à la boîte partagée accordé",
    fam_org_event_shared_mailbox_grant_revoked:
      "Accès à la boîte partagée retiré",
    fam_org_event_shared_mailbox_rotated:
      "Clés de la boîte partagée renouvelées",
    fam_org_event_consent_request_created: "Consentement demandé",
    fam_org_event_consent_declined: "Consentement refusé",
    fam_org_event_consent_all_accepted: "Consentement terminé",
    fam_org_activity_address_reserved:
      "{{actor}} a réservé une adresse pour un enfant",
    fam_org_activity_reservation_released:
      "{{actor}} a libéré une adresse réservée",
    fam_org_activity_shared_mailbox_created:
      "{{actor}} a créé une boîte partagée",
    fam_org_activity_shared_mailbox_deleted:
      "{{actor}} a supprimé une boîte partagée",
    fam_org_activity_shared_mailbox_grant_added:
      "{{actor}} a donné accès à une boîte partagée",
    fam_org_activity_shared_mailbox_grant_revoked:
      "{{actor}} a retiré l’accès à une boîte partagée",
    fam_org_activity_shared_mailbox_rotated:
      "{{actor}} a renouvelé les clés d’une boîte partagée",
    fam_org_activity_group_member_added:
      "{{actor}} a ajouté {{target}} à un groupe",
    fam_org_activity_group_member_added_generic:
      "{{actor}} a ajouté une personne à un groupe",
    fam_org_activity_group_member_removed:
      "{{actor}} a retiré {{target}} d’un groupe",
    fam_org_activity_group_member_removed_generic:
      "{{actor}} a retiré une personne d’un groupe",
    fam_org_activity_consent_request_created:
      "{{actor}} a demandé un consentement",
    fam_org_activity_consent_declined:
      "{{actor}} a refusé une demande de consentement",
    fam_org_activity_consent_all_accepted:
      "Tout le monde a accepté la demande de consentement",
    color_theme_pink: "Rose vif",
    color_theme_emerald: "Émeraude",
    color_theme_black: "Noir",
    sign_out_everywhere_success_one: "Déconnecté de {{count}} autre session",
    sign_out_everywhere_success_other:
      "Déconnecté de {{count}} autres sessions",
    deleted_emails_count_one: "{{count}} e-mail supprimé",
    deleted_emails_count_other: "{{count}} e-mails supprimés",
    external_account_count_one: "{{count}} compte externe",
    external_account_count_other: "{{count}} comptes externes",
    email_count_one: "{{count}} e-mail",
    email_count_other: "{{count}} e-mails",
    allowed_senders_count_one: "{{count}} expéditeur autorisé",
    allowed_senders_count_other: "{{count}} expéditeurs autorisés",
    blocked_senders_count_one: "{{count}} expéditeur bloqué",
    blocked_senders_count_other: "{{count}} expéditeurs bloqués",
    plan_domains_count_one: "{{count}} domaine",
    plan_domains_count_other: "{{count}} domaines",
    forwarding_rules_count_one: "{{count}} règle de transfert",
    forwarding_rules_count_other: "{{count}} règles de transfert",
    export_complete_errors_one: "{{count}} message n'a pas pu être exporté.",
    export_complete_errors_other:
      "{{count}} messages n'ont pas pu être exportés.",
    export_complete_skipped_undecryptable_one:
      "{{count}} message n'a pas pu être déchiffré et a été exclu de cette archive.",
    export_complete_skipped_undecryptable_other:
      "{{count}} messages n'ont pas pu être déchiffrés et ont été exclus de cette archive.",
    export_complete_skipped_attachments_one:
      "{{count}} pièce jointe n'a pas pu être déchiffrée et a été exclue de cette archive.",
    export_complete_skipped_attachments_other:
      "{{count}} pièces jointes n'ont pas pu être déchiffrées et ont été exclues de cette archive.",
    fam_consent_body_one:
      "Cette modification concerne les données de tous les membres de la famille. Une demande de consentement sera envoyée à {{count}} membre. La modification ne prendra effet qu'une fois que tous les membres l'auront acceptée.",
    fam_consent_body_other:
      "Cette modification concerne les données de tous les membres de la famille. Une demande de consentement sera envoyée à {{count}} membres. La modification ne prendra effet qu'une fois que tous les membres l'auront acceptée.",
    purge_confirm_message_one:
      "{{count}} e-mail importé depuis {{email}} sera supprimé définitivement. Cette action est irréversible.",
    purge_confirm_message_other:
      "Les {{count}} e-mails importés depuis {{email}} seront supprimés définitivement. Cette action est irréversible.",
    alias_export_summary_one: "{{count}} entrée répartie sur {{files}}.",
    alias_export_summary_other: "{{count}} entrées réparties sur {{files}}.",
    app_lock_attempts_remaining_one: "{{count}} tentative restante",
    app_lock_attempts_remaining_other: "{{count}} tentatives restantes",
    vacation_reply_count: "{{count}} réponses envoyées",
    vacation_n_replies_sent_one: "{{count}} réponse envoyée",
    vacation_n_replies_sent_other: "{{count}} réponses envoyées",
    dev_databases_count: "{{count}} bases de données",
    fam_org_activity_events_one: "{{count}} événement",
    fam_org_activity_events_other: "{{count}} événements",
    family_activity_events_one: "{{count}} événement",
    family_activity_events_other: "{{count}} événements",
    fam_org_2fa_banner_one:
      "{{count}} membre n'a pas activé l'authentification à deux facteurs",
    fam_org_2fa_banner_other:
      "{{count}} membres n'ont pas activé l'authentification à deux facteurs",
    family_security_warning_2fa_one:
      "{{count}} membre n'a pas activé l'authentification à deux facteurs",
    family_security_warning_2fa_other:
      "{{count}} membres n'ont pas activé l'authentification à deux facteurs",
    fam_org_sec_session_count_one: "{{count}} session active",
    fam_org_sec_session_count_other: "{{count}} sessions actives",
    fam_org_stat_seats_available_one: "{{count}} place disponible",
    fam_org_stat_seats_available_other: "{{count}} places disponibles",
    fam_org_members_count_one:
      "{{used}} places sur {{max}} utilisées · {{count}} place disponible",
    fam_org_members_count_other:
      "{{used}} places sur {{max}} utilisées · {{count}} places disponibles",
  },
  mail: {
    load_all_thread_messages: "Charger tous les messages",
    move_to_category: "Déplacer vers la catégorie",
    menu_applies_to_selection: "S'applique à {count} sélectionnés",
    menu_applies_to_all: "S'applique aux {count} messages",
    moved_to_category: "Déplacé vers la catégorie",
    drop_to_move_here: "Déposez ici pour déplacer",
    tab_new_count: "nouveau(x)",
    tab_unread_count: "{{count}} non lus",
    category_empty_primary_title: "Rien dans Principal",
    category_empty_primary_desc:
      "Vos messages personnels et vos conversations apparaîtront ici.",
    category_empty_promotions_title: "Aucun bon plan",
    category_empty_promotions_desc:
      "Les bons plans, promotions et e-mails marketing apparaîtront ici, à l'écart du reste de votre courrier.",
    category_empty_social_title: "Aucune actualité sociale",
    category_empty_social_desc:
      "Les messages des réseaux sociaux et des communautés apparaîtront ici.",
    category_empty_updates_title: "Aucune notification",
    category_empty_updates_desc:
      "Les reçus, confirmations et factures apparaîtront ici.",
    category_empty_forums_title: "Aucune discussion",
    category_empty_forums_desc:
      "Les messages des listes de diffusion et groupes de discussion apparaîtront ici.",
    category_empty_finance_title: "Aucun e-mail financier",
    category_empty_finance_desc:
      "Les relevés, factures et alertes des banques et services financiers apparaîtront ici.",
    category_empty_travel_title: "Aucun e-mail de voyage",
    category_empty_travel_desc:
      "Les réservations, itinéraires et confirmations apparaîtront ici.",
    category_empty_shopping_title: "Aucun e-mail d'achat",
    category_empty_shopping_desc:
      "Les confirmations de commande et mises à jour de livraison apparaîtront ici.",
    category_empty_custom_desc:
      "Les e-mails correspondant aux règles de cette catégorie apparaîtront ici.",
    view_html_part: "Afficher le HTML",
    view_plain_text: "Afficher le texte brut",
    html_blocked_label: "HTML bloqué",
    block_sender_on_alias: "Bloquer l'expéditeur sur l'alias",
    block_sender_on_alias_success: "{{sender}} bloqué sur {{alias}}",
    block_sender_on_alias_failed:
      "Impossible de bloquer l'expéditeur. Réessayez.",
    block_sender_on_alias_tooltip:
      "Empêcher cet expéditeur de joindre {{alias}}",
    encrypted_message_unavailable:
      "Ce message n'a pas pu être déchiffré. L'expéditeur a peut-être utilisé une clé obsolète.",
    pgp_password_protected_title: "Message protégé par mot de passe",
    pgp_password_protected_description:
      "L'expéditeur a chiffré ce message avec un mot de passe. Saisissez le mot de passe qu'il vous a communiqué pour le lire.",
    pgp_password_placeholder: "Mot de passe",
    pgp_password_decrypt: "Déchiffrer",
    pgp_password_decrypting: "Déchiffrement...",
    pgp_password_incorrect:
      "Ce mot de passe n'a pas fonctionné. Vérifiez-le auprès de l'expéditeur et réessayez.",
    inbox: "Boîte de réception",
    sent: "Envoyés",
    drafts: "Brouillons",
    starred: "Suivis",
    archive: "Archiver",
    spam: "Indésirables",
    trash: "Corbeille",
    scheduled: "Programmés",
    snoozed: "En veille",
    all_mail: "Tous les courriers",
    compose: "Rédiger",
    primary: "Principal",
    social: "Réseaux sociaux",
    promotions: "Promotions",
    updates: "Mises à jour",
    forums: "Forums",
    purchases: "Achats",
    all: "Tout",
    reply: "Répondre",
    reply_all: "Répondre à tous",
    react: "Réagir",
    already_reacted: "Vous avez déjà réagi avec ceci",
    remove_your_reaction: "Supprimer votre réaction {emoji}",
    you_reacted_with: "Vous avez réagi avec {{emoji}}",
    reacted_with: "{{name}} a réagi avec {{emoji}}",
    forward: "Transférer",
    to: "À",
    cc: "Cc",
    bcc: "Cci",
    subject: "Objet",
    from: "De",
    date: "Date",
    attachments: "Pièces jointes",
    translation_offer: "Ce message est en {{language}}.",
    translation_translate: "Traduire",
    translation_offer_download:
      "Ce message est en {{language}}. Le traduire télécharge un pack linguistique.",
    translation_translate_download: "Traduire (téléchargement de {{size}})",
    translation_in_progress: "Traduction sur votre appareil…",
    translation_translated_from: "Traduit du {{language}} sur votre appareil.",
    translation_limited_quality:
      "La qualité de la traduction peut être moindre pour cette langue.",
    translation_show_original: "Afficher l'original",
    translation_show_translation: "Afficher la traduction",
    translation_showing_original: "Affichage du message d'origine.",
    translation_unavailable: "Ce message n'a pas pu être traduit.",

    no_subject: "(Sans objet)",
    no_messages: "Aucun message",
    unread: "Non lu",
    mark_as_read: "Marquer comme lu",
    mark_as_unread: "Marquer comme non lu",
    find_emails_from: "Rechercher les e-mails de {{sender}}",
    move_to: "Déplacer vers",
    label: "Libellé",
    select_recipients: "Sélectionner les destinataires",
    send: "Envoyer",
    send_later: "Envoyer plus tard",
    discard: "Supprimer",
    save_draft: "Enregistrer le brouillon",
    attachment_add: "Ajouter une pièce jointe",
    attachment_remove: "Supprimer la pièce jointe",
    back: "Retour",
    archiving: "Archivage...",
    mark_as_spam: "Marquer comme indésirable",
    marking_as_spam: "Marquage comme indésirable...",
    move_to_trash: "Déplacer vers la corbeille",
    moving_to_trash: "Déplacement vers la corbeille...",
    delete_permanently: "Supprimer définitivement",
    deleting_permanently: "Suppression définitive...",
    sending_in: "Envoi dans",
    press_to_undo: "pour annuler",
    tap_undo_to_cancel: "Appuyez sur annuler pour annuler",
    cancel_sending: "Annuler l'envoi de l'e-mail",
    send_immediately: "Envoyer l'e-mail immédiatement",
    new_message: "Nouveau message",
    expand_compose: "Agrandir la fenêtre de rédaction",
    minimize_compose: "Réduire la fenêtre de rédaction",
    resize_compose: "Redimensionner la fenêtre de rédaction",
    close_compose: "Fermer la fenêtre de rédaction",
    enter_fullscreen: "Passer en plein écran",
    exit_fullscreen: "Quitter le plein écran",
    draft: "Brouillon",
    to_label: "À",
    cc_label: "Cc",
    bcc_label: "Cci",
    encrypted: "Chiffré",
    read_receipt: "Accusé de réception",
    snooze: "Mise en veille",
    unsnooze: "Sortir de veille",
    pin: "Épingler",
    pin_to_top: "Épingler en haut",
    unpin: "Désépingler",
    mute: "Couper le son",
    unmute: "Rétablir le son",
    print: "Imprimer",
    view_source: "Voir la source",
    share: "Partager",
    download_eml: "Télécharger EML",
    move_to_folder: "Déplacer vers un dossier",
    apply_label: "Appliquer un libellé",
    select: "Sélectionner",
    selected: "sélectionné(s)",
    mark_all_read: "Tout marquer comme lu",
    empty_trash: "Vider la corbeille",
    empty_spam: "Vider les indésirables",
    report_phishing: "Signaler le spam",
    not_spam: "Non indésirable",
    spam_reasons_title: "Ce message a été déplacé vers les indésirables",
    spam_reason_content_analysis:
      "Le contenu de ce message ressemble à un courrier indésirable",
    spam_reason_spf_fail: "L'expéditeur a échoué à la vérification SPF",
    spam_reason_dkim_fail:
      "Le message a échoué à la vérification de la signature DKIM",
    spam_reason_dmarc_fail:
      "Le domaine de l'expéditeur a échoué à l'authentification DMARC",
    spam_reason_missing_headers:
      "Le message ne contient pas les en-têtes d'e-mail standard",
    spam_reason_reply_to_mismatch:
      "L'adresse de réponse ne correspond pas à l'expéditeur",
    spam_reason_future_dated: "Le message est daté dans le futur",
    spam_reason_phishing_url:
      "Il contient un lien figurant sur une liste de blocage de phishing",
    spam_reason_phishing_domain:
      "Il pointe vers un domaine associé au phishing",
    spam_reason_user_spam_learning:
      "Vous avez déjà signalé des courriers indésirables provenant du domaine de cet expéditeur",
    spam_reason_global_domain_reputation:
      "Le domaine de l'expéditeur a une mauvaise réputation",
    spam_reason_auth_hard_fail: "L'expéditeur n'a pas pu être authentifié",
    spam_reason_sender_marked_spam:
      "Vous avez marqué cet expéditeur comme indésirable",
    block_sender: "Bloquer l'expéditeur",
    unblock_sender: "Débloquer l'expéditeur",
    unsubscribe: "Se désabonner",
    edit_draft: "Modifier le brouillon",
    schedule: "Programmer",
    scheduling: "Programmation",
    saved: "Enregistré",
    saving_draft: "Enregistrement...",
    write_message: "Rédigez votre message...",
    show_quoted_text: "Afficher le texte cité",
    hide_quoted_text: "Masquer le texte cité",
    remove_quoted_text: "Supprimer le texte cité",
    quoted_text_removed: "Texte cité supprimé",
    restore_quoted_text: "Restaurer",
    show_forwarded: "Afficher le transfert",
    hide_forwarded: "Masquer le transfert",
    delete_this_draft: "Supprimer ce brouillon ?",
    all_emails: "Tous les e-mails",
    unread_only: "Non lus uniquement",
    read_only: "Lus uniquement",
    with_attachments: "Avec pièces jointes",
    filter: "Filtrer",
    views: "Vues",
    quick_actions: "Actions rapides",
    archive_all_read_emails: "Archiver tous les e-mails lus",
    delete_emails_older_than_30_days:
      "Supprimer les e-mails de plus de 30 jours",
    sender_actions: "Actions sur l'expéditeur",
    archive_all_from_sender: "Archiver tout de l'expéditeur...",
    delete_all_from_sender: "Supprimer tout de l'expéditeur...",
    move_all_from_sender: "Déplacer tout de l'expéditeur vers...",
    smart_actions: "Actions intelligentes",
    snooze_similar_emails: "Mettre en veille les e-mails similaires",
    bulk_unsubscribe: "Désabonnement en masse",
    archive_all_newsletters: "Archiver toutes les newsletters",
    scanning_for_newsletters: "Recherche des newsletters en cours...",
    archiving_newsletters: "Archivage des newsletters en cours...",
    mark_all_read_confirm_title: "Marquer tout comme lu ?",
    mark_all_read_confirm_message:
      "Ceci marquera comme lu chaque e-mail non lu de votre boîte de réception.",
    archive_all_read_confirm_title: "Archiver tous les e-mails lus ?",
    archive_all_read_confirm_message:
      "Ceci archivera chaque e-mail lu de votre boîte de réception. Vous pourrez annuler cette action juste après.",
    delete_old_confirm_title: "Supprimer les e-mails de plus de 30 jours ?",
    delete_old_confirm_message:
      "Ceci déplacera vers la corbeille chaque e-mail de plus de 30 jours. Vous pourrez annuler cette action juste après.",
    archive_newsletters_confirm_title: "Archiver toutes les newsletters ?",
    archive_newsletters_confirm_message:
      "Ceci archivera chaque e-mail détecté comme newsletter dans votre boîte de réception. Vous pourrez annuler cette action juste après.",
    delete_all: "Tout supprimer",
    archive_subtitle:
      "Archiver les e-mails pour garder votre boîte de réception propre",
    trash_subtitle: "Les e-mails supprimés apparaîtront ici",
    compose_email: "Rédiger un e-mail",
    one_hour_option: "1 heure",
    twenty_four_hours_option: "24 heures",
    seven_days_option: "7 jours",
    thirty_days_option: "30 jours",
    search_messages: "Rechercher dans vos messages...",
    search_by_sender: "Rechercher par expéditeur",
    filter_by_attachments: "Filtrer par pièces jointes",
    filter_by_status: "Filtrer par statut",
    search_by_recipient: "Rechercher par destinataire",
    search_in_subject: "Rechercher dans l'objet",
    searching: "Recherche...",
    empty_trash_button: "Vider la corbeille",
    empty_spam_button: "Vider les indésirables",
    archived_label: "Archivé",
    write_reply: "Rédigez votre réponse...",
    trash_messages_confirmation:
      "Les messages sélectionnés sont déplacés vers la Corbeille, d'où vous pouvez les restaurer.",
    delete_messages_title: "Supprimer les messages",
    delete_messages_confirmation:
      "Les messages sélectionnés seront retirés pour de bon et vous ne pouvez pas annuler cette action.",
    confirm_bulk_action_title: "Confirmer l'action groupée",
    confirm_bulk_action_description:
      "Cette action affectera toutes les conversations de cette vue.",
    bulk_action_index_not_ready:
      "Cet onglet est encore en cours d'indexation. Réessayez dans un instant.",
    bulk_action_index_building:
      "Cet onglet est encore en cours d’indexation. L’action démarre dès que l’index est prêt.",
    bulk_action_index_capped:
      "Cet onglet contient trop de conversations pour tout mettre à jour en une fois. Sélectionne des conversations et réessaie.",
    archive_messages_title: "Archiver les messages",
    archive_messages_confirmation:
      "Êtes-vous sûr de vouloir archiver les messages sélectionnés ?",
    spam_email_sender_message:
      "Ce message est déplacé vers le dossier Spam, avec les autres messages de cet expéditeur dans cette vue. Les nouveaux messages de cet expéditeur arrivent également dans le dossier Spam.",
    mark_spam_title: "Marquer comme indésirable ?",
    mark_spam_confirmation:
      "Êtes-vous sûr de vouloir marquer les messages sélectionnés comme indésirables ?",
    archive_email_title: "Archiver l'e-mail ?",
    delete_email_confirmation:
      "Ce message sera retiré pour de bon et vous ne pouvez pas annuler cette action.",
    empty_trash_confirmation:
      "Tout ce qui se trouve dans la corbeille sera retiré pour de bon et vous ne pouvez pas annuler cette action.",
    empty_tag_subtitle:
      "Les e-mails étiquetés avec ce libellé apparaîtront ici",
    self_destructs_in: "S'autodétruit dans {{time}}",
    cancel_scheduled_confirmation:
      "Annuler ce message programmé. Il ne sera pas envoyé et vous ne pouvez pas annuler cette action, mais votre brouillon est enregistré.",
    shipping_label_created: "Étiquette créée",
    shipping_shipped: "Expédié",
    shipping_in_transit: "En transit",
    shipping_out_for_delivery: "En cours de livraison",
    shipping_delivered: "Livré",
    shipping_delivery_exception: "Exception de livraison",
    shipping_status_unknown: "Statut inconnu",
    shipping_shipped_date: "Date d'expédition",
    shipping_delivered_on: "Livré le",
    bold: "Gras",
    italic: "Italique",
    underline: "Souligné",
    strikethrough: "Barré",
    blockquote: "Citation",
    horizontal_rule: "Ligne horizontale",
    bullet_list: "Liste à puces",
    numbered_list: "Liste numérotée",
    insert_link: "Insérer un lien",
    insert_image: "Insérer une image",
    attach_file: "Joindre un fichier",
    more_formatting: "Plus de mise en forme",
    text_style: "Style du texte",
    text_alignment: "Alignement du texte",
    text_formatting: "Mise en forme du texte",
    formatting_options: "Options de mise en forme",
    format_text: "Formater",
    align_left: "Aligner à gauche",
    align_center: "Centrer",
    align_right: "Aligner à droite",
    heading_normal: "Normal",
    heading_1: "Titre 1",
    heading_2: "Titre 2",
    heading_3: "Titre 3",
    add_file: "Ajouter un fichier",
    attaching_original_files: "Pièces jointes d'origine en cours d'ajout",
    display_text_placeholder: "Texte d'affichage",
    url_placeholder: "https://exemple.com",
    schedule_send: "Programmer l'envoi",
    insert_template: "Insérer un modèle",
    insert_signature: "Insérer une signature",
    no_signature: "Aucune signature",
    self_destruct: "Autodestruction",
    self_destruct_after: "Autodestruction après",
    category_promos: "Promotions",
    search_history: "Historique de recherche",
    search_error:
      "La recherche ne s'est pas terminée. Un autre essai devrait suffire.",
    delete_draft_confirmation:
      "Ce brouillon et toutes les modifications non enregistrées seront retirés pour de bon.",
    plain_text_warning:
      "Passer en texte brut retire toute la mise en forme de ce brouillon, et le compositeur ne peut pas la ramener. Vos autres brouillons ne sont pas affectés.",
    remove_formatting: "Supprimer la mise en forme",
    encrypt_with_pgp: "Chiffrer avec PGP",
    pgp_encryption_active:
      "Chiffrement PGP actif - la clé publique du destinataire sera utilisée",
    font_color: "Couleur du texte",
    highlight_color: "Couleur de surlignage",
    write_message_placeholder: "Écrire un message",
    enter_password_placeholder: "Saisir le mot de passe...",
    folder: "Dossier",
    empty_inbox_title: "Votre boîte de réception est vide",
    empty_inbox_subtitle: "Les nouveaux messages apparaîtront ici",
    empty_sent_title: "Aucun message envoyé",
    empty_sent_subtitle: "Les messages que vous envoyez apparaîtront ici",
    empty_drafts_title: "Aucun brouillon",
    empty_drafts_subtitle: "Les brouillons en cours apparaîtront ici",
    empty_starred_title: "Aucun message suivi",
    empty_starred_subtitle:
      "Ajoutez une étoile aux e-mails importants pour les retrouver rapidement",
    empty_archive_title: "Rien d'archivé",
    empty_spam_title: "Aucun indésirable",
    empty_spam_subtitle: "Les e-mails suspects seront interceptés ici",
    empty_trash_title: "La corbeille est vide",
    empty_folder_title: "Ce dossier est vide",
    empty_folder_subtitle: "Déplacez des e-mails ici pour les organiser",
    empty_tag_title: "Aucun e-mail avec ce libellé",
    empty_default_subtitle: "Rien à afficher ici pour le moment",
    add_label: "Ajouter un libellé",
    later_today_snooze: "Plus tard aujourd'hui (4 heures)",
    tomorrow_snooze: "Demain (9h)",
    this_weekend_snooze: "Ce week-end",
    next_week_snooze: "La semaine prochaine",
    next_month_snooze: "Le mois prochain",
    pick_date_time: "Choisir date et heure",
    restore: "Restaurer",
    move_to_inbox: "Déplacer vers la boîte de réception",
    report_spam: "Signaler comme indésirable",
    clear_selection: "Effacer la sélection",
    archive_email_question: "Archiver l'e-mail ?",
    move_to_trash_question: "Déplacer vers la corbeille ?",
    archive_email_message:
      "Cet e-mail sera déplacé vers votre dossier Archive.",
    trash_email_message: "Cet e-mail sera déplacé vers votre Corbeille.",
    view_contact_profile: "Voir le profil du contact",
    toggle_filters: "Basculer les filtres",
    save_search: "Enregistrer cette recherche",
    clear_search_data: "Effacer les données de recherche",
    cancel_scheduled_email: "Annuler l'e-mail programmé",
    email_content: "Contenu de l'e-mail",
    remove_attachment: "Supprimer la pièce jointe",
    keep_scheduled: "Garder la programmation",
    cancelling: "Annulation...",
    cancel_email: "Annuler l'e-mail",
    go_to_inbox: "Aller à la boîte de réception",
    go_to_sent: "Aller aux envoyés",
    go_to_drafts: "Aller aux brouillons",
    go_to_starred: "Aller aux suivis",
    go_to_archive: "Aller à l'archive",
    go_to_trash: "Aller à la corbeille",
    go_to_spam: "Aller aux indésirables",
    go_to_scheduled: "Aller aux programmés",
    view_inbox: "Voir votre boîte de réception",
    view_sent: "Voir les e-mails envoyés",
    view_drafts: "Voir les brouillons",
    view_starred: "Voir les e-mails suivis",
    view_archived: "Voir les e-mails archivés",
    view_deleted: "Voir les e-mails supprimés",
    view_spam: "Voir les e-mails indésirables",
    view_scheduled: "Voir les e-mails programmés",
    start_new_message: "Commencer à rédiger un nouveau message",
    mark_all_unread_as_read: "Marquer tous les e-mails non lus comme lus",
    move_read_to_archive: "Déplacer tous les e-mails lus vers l'archive",
    move_old_to_trash: "Déplacer les anciens e-mails vers la corbeille",
    star_all_unread: "Ajouter une étoile à tous les e-mails non lus",
    add_star_unread: "Ajouter une étoile à tous les messages non lus",
    remove_all_stars: "Retirer toutes les étoiles",
    unstar_all: "Retirer l'étoile de tous les e-mails suivis",
    permanently_delete_trash:
      "Supprimer définitivement tous les éléments de la corbeille",
    move_spam_to_trash: "Déplacer tous les indésirables vers la corbeille",
    check_new_emails: "Vérifier les nouveaux e-mails",
    switch_to_light: "Passer en mode clair",
    switch_to_dark: "Passer en mode sombre",
    toggle_theme: "Basculer entre le thème clair et sombre",
    open_settings: "Ouvrir les paramètres",
    configure_preferences: "Configurer vos préférences",
    view_keyboard_shortcuts: "Voir tous les raccourcis clavier",
    log_out_label: "Se déconnecter",
    log_out_account: "Se déconnecter de votre compte",
    category_navigation: "Navigation",
    category_mail: "Courrier",
    category_view: "Affichage",
    sort_relevance: "Pertinence",
    sort_newest: "Plus récent d'abord",
    sort_oldest: "Plus ancien d'abord",
    sort_sender: "Nom de l'expéditeur",
    search_field_all: "Tout",
    search_field_subject: "Objet",
    search_field_body: "Corps",
    search_field_sender: "Expéditeur",
    search_field_recipient: "Destinataire",
    filter_today: "Aujourd'hui",
    filter_yesterday: "Hier",
    filter_this_week: "Cette semaine",
    filter_last_week: "La semaine dernière",
    filter_this_month: "Ce mois-ci",
    filter_has_attachment: "Avec pièce jointe",
    filter_last_month: "Le mois dernier",
    filter_unread: "Non lu",
    filter_starred: "Suivi",
    filter_attachments: "Pièces jointes",
    mark_read_title: "Marquer comme lu",
    mark_unread_title: "Marquer comme non lu",
    star_title: "Étoile",
    unstar_title: "Retirer l'étoile",
    has_attachments_search: "A des pièces jointes",
    has_pdf_search: "A des fichiers PDF",
    unread_emails_search: "E-mails non lus",
    starred_emails_search: "E-mails suivis",
    in_sent_folder: "Dans le dossier envoyés",
    after_date_search: "Après la date",
    search_exact_match: "Correspondance exacte",
    from_today_search: "À partir d'aujourd'hui",
    exclude_sender: "Exclure l'expéditeur",
    please_enter_name: "Veuillez saisir un nom",
    contact: "Contact",
    emails: "E-mails",
    recent_searches: "Recherches récentes",
    saved_searches: "Recherches enregistrées",
    result_cache: "Cache des résultats",
    query: "Requête",
    enter_search_name: "Saisir un nom pour cette recherche...",
    no_results_for: "Aucun résultat pour “{{query}}”",
    try_search_operators:
      "Essayez d'affiner votre recherche avec des opérateurs",
    search_operators: "Opérateurs de recherche",
    search_by_sender_subject_content:
      "Rechercher par expéditeur, objet ou contenu",
    has_attachments: "A des pièces jointes",
    starred_only: "Suivis uniquement",
    search_in: "Rechercher dans",
    from_date: "À partir de la date",
    to_date: "Jusqu'à la date",
    no_results_found: "Aucun résultat trouvé",
    view_all_results: "Voir tous les résultats pour “{{query}}”",
    folders: "Dossiers",
    showing_results: "Affichage de {{shown}} sur {{total}} résultats",
    indexing: "Indexation",
    active_filters: "Filtres actifs :",
    quick_filters: "Filtres rapides :",
    larger_than_search: "Plus grand que 5 Mo",
    search_privacy_note:
      "La recherche est effectuée côté client en utilisant des jetons chiffrés. Vos messages restent chiffrés de bout en bout.",
    navigate: "Naviguer",
    load_more_results: "Charger plus de résultats ({{remaining}} restants)",
    contacts: "Contacts",
    scheduled_for: "Programmé pour",
    scheduled_send_failed:
      "Ce message n'a pas pu être envoyé. Choisis une nouvelle heure d'envoi pour réessayer.",
    section_pinned: "Épinglés",
    section_primary: "Principal",
    spam_email_message:
      "Cet e-mail sera déplacé vers votre dossier Indésirables.",
    delete_permanently_question: "Supprimer définitivement ?",
    empty_spam_folder_question: "Vider le dossier indésirables ?",
    empty_spam_description:
      "Tous les {{count}} messages dans les indésirables seront retirés pour de bon et vous ne pouvez pas annuler cette action.",
    empty_trash_question: "Vider la corbeille ?",
    empty_trash_description:
      "Tous les {{count}} messages dans la corbeille seront retirés pour de bon et vous ne pouvez pas annuler cette action.",
    folder_not_found_title: "Nous n'avons pas pu trouver ce dossier.",
    folder_not_found_subtitle:
      "Ce dossier a peut-être été retiré ou n'a jamais existé. Un autre de la barre latérale fonctionnera.",
    tag_not_found_title: "Nous n'avons pas pu trouver cette étiquette.",
    tag_not_found_subtitle:
      "Cette étiquette a peut-être été retirée ou n'a jamais existé. Une autre de la barre latérale fonctionnera.",
    folder_locked_title: "Ce dossier est verrouillé.",
    enter_password_to_access: 'Votre mot de passe ouvrira "{{folder}}".',
    shortcut_previous_email: "E-mail précédent",
    shortcut_open_email: "Ouvrir l'e-mail",
    shortcut_close_back: "Fermer / retour à la liste",
    shortcut_back_to_list: "Retour à la liste",
    shortcut_delete_trash: "Supprimer / corbeille",
    shortcut_star_unstar: "Étoile / retirer l'étoile",
    shortcut_compose_new: "Rédiger un nouvel e-mail",
    shortcut_search: "Rechercher",
    shortcut_command_palette: "Palette de commandes",
    shortcut_show_shortcuts: "Afficher les raccourcis",
    important: "Important",
    sent_by_me: "Envoyé par moi",
    most_relevant: "Plus pertinent",
    most_recent: "Plus récent",
    use_arrows_to_navigate:
      "Utilisez les flèches ci-dessus pour naviguer entre les pages",
    end_of_results: "Fin des résultats",
    open_in_new_window: "Ouvrir dans une nouvelle fenêtre",
    add_password: "Ajouter un mot de passe",
    require_password_to_view: "Mot de passe requis pour consulter",
    pick_expiration: "Choisir l'expiration",
    set_expiration: "Définir l'expiration",
    password_description:
      "Les destinataires externes auront besoin de ce mot de passe pour consulter l'e-mail",
    no_password: "Pas de mot de passe",
    replying_to: "Réponse à {{name}}",
    reply_sent_successfully: "Réponse envoyée avec succès",
    successfully_unsubscribed: "Désabonnement réussi",
    unsubscribe_success_message:
      "Vous ne recevrez plus d'e-mails de {{sender}}",
    unsubscribe_failed:
      "Le désabonnement ne s'est pas terminé. Le lien dans le message vous emmènera sur le site de l'expéditeur pour le faire vous-même.",
    unsubscribe_try_again:
      "Un autre essai, ou le lien ci-dessous, vous permettra de vous désabonner vous-même.",
    unsubscribe_manual_required:
      "Cet expéditeur ne prend pas en charge le désabonnement automatique. Le lien dans le message vous permettra de le faire vous-même.",
    stop_receiving_from: "Arrêter de recevoir des e-mails de",
    send_email: "Envoyer un e-mail",
    purchase_receipt: "Reçu d'achat",
    order_number: "Commande n°{{id}}",
    items: "Articles",
    more_items_count: "+{{count}} articles supplémentaires",
    card_ending_in: "Carte se terminant par {{last_four}}",
    confirmation_label: "Confirmation : {{number}}",
    transaction_label: "Transaction : {{id}}",
    purchase_extraction_privacy:
      "Extrait localement depuis votre e-mail, et rien n'est envoyé à nos serveurs.",
    ordered_from: "Commandé chez {{merchant}}",
    receipt_is_this_correct: "Est-ce correct ?",
    receipt_feedback_correct: "Oui, c'est correct",
    receipt_feedback_incorrect: "Non, il y a une erreur",
    receipt_feedback_thanks: "Merci pour votre retour",
    external_content_blocked: "Contenu externe bloqué ({{message}})",
    message_deleted: "Ce message a été supprimé",
    unknown_recipient: "(destinataire inconnu)",
    lines_count: "{{count}} lignes",
    message_label: "message",
    messages_label: "messages",
    star: "Étoile",
    unstar: "Retirer l'étoile",
    mark_unread: "Marquer comme non lu",
    mark_read: "Marquer comme lu",
    copy_message_id: "Copier l'ID du message",
    hide_source: "Masquer la source",
    view_dark_mode: "Voir en mode sombre",
    exit_dark_mode: "Quitter le mode sombre",
    view_all_dark_mode: "Tout voir en mode sombre",
    exit_all_dark_mode: "Quitter le mode sombre pour tous",
    from_header: "De",
    sent_label: "Envoyé",
    scheduled_label: "Programmé",
    trashed_label: "Supprimé",
    spam_label: "Indésirable",
    attachment_chips_more: "+{{count}} de plus",
    page_of_total: "Page {{current}} sur {{total}}",
    total_pages_label: "{{count}} pages",
    loading_preview: "Chargement de l'aperçu…",
    preview_failed:
      "L'aperçu ne s'est pas chargé. Ouvrir le message l'affichera.",
    move_1_conversation: "Déplacer 1 conversation",
    move_n_conversations: "Déplacer {{ count }} conversations",
    move_n_conversations_one: "Déplacer {{count}} conversation",
    move_n_conversations_other: "Déplacer {{count}} conversations",
    view_message: "Voir le message",
    blocking: "Blocage en cours...",
    block: "Bloquer",
    unsubscribe_title: "Se désabonner",
    manual_unsubscribe_link: "Lien de désabonnement manuel :",
    empty_snoozed_title: "Rien en veille pour le moment",
    empty_snoozed_subtitle: "Les e-mails en veille se réveilleront ici",
    block_sender_spam_warning:
      "Désormais, les nouveaux messages de cet expéditeur iront directement dans les indésirables. Votre liste de blocage propose l'option de les débloquer plus tard.",
    block_sender_confirm_message:
      "Bloquer {{email}} ? Vous ne recevrez plus d'e-mails de sa part.",
    unsubscribe_confirm_message:
      "Êtes-vous sûr de vouloir vous désabonner de cette liste de diffusion ?",
    max_composers_warning:
      "Jusqu'à trois compositeurs peuvent être ouverts à la fois. En fermer un en laissera un autre démarrer. Vos brouillons sont enregistrés.",
    self_destruct_tooltip:
      "Cet e-mail sera définitivement supprimé après l'expiration du minuteur",
    add_link_to_selection: 'Ajouter un lien à "{{text}}"',
    advanced_search: "Recherche avancée",
    all_in_folder_selected:
      "Toutes les {{ count }} conversations sont sélectionnées.",
    all_on_page_selected:
      "Toutes les {{ count }} conversations de cette page sont sélectionnées.",
    all_search_results_for: "Tous les résultats pour “{{query}}”",
    attachment_singular: "pièce jointe",
    load_attachments: "Charger les pièces jointes",
    bounced: "Rejeté",
    copy_headers: "Copier les en-têtes",
    create_filter: "Créer un filtre",
    delivered: "Livré",
    download_file_named: "Telecharger {{filename}}",
    download_headers: "Télécharger les en-têtes",
    email_is_clean: "Cet e-mail est propre",
    encryption_label: "Chiffrement",
    failed_status: "Échec",
    filter_after: "Après : {{ value }}",
    filter_before: "Avant : {{ value }}",
    filter_date: "Date : {{ value }}",
    filter_filename: "Nom de fichier : {{ value }}",
    filter_folder: "Dossier : {{ value }}",
    filter_from: "De : {{ value }}",
    filter_has_type: "A {{ type }}",
    filter_id: "ID : {{ value }}",
    filter_in: "Dans : {{ value }}",
    filter_label: "Étiquette : {{ value }}",
    filter_larger: "Plus grand que : {{ value }}",
    filter_no_attachments: "Aucune pièce jointe",
    filter_no_type: "Aucun {{ type }}",
    filter_not_prefix: "non",
    filter_not_starred: "Sans étoile",
    filter_read: "Lu",
    filter_size: "Taille : {{ value }}",
    filter_smaller: "Plus petit que : {{ value }}",
    filter_subject: "Objet : {{ value }}",
    filter_to: "À : {{ value }}",
    filter_contact: "Contact : {{ value }}",
    filter_type_archive: "Archive",
    filter_type_audio: "Audio",
    filter_type_document: "Document",
    filter_type_image: "Image",
    filter_type_pdf: "PDF",
    filter_type_spreadsheet: "Feuille de calcul",
    filter_type_video: "Vidéo",
    folder_item_count: "{{count}} éléments",
    folder_item_count_singular: "{{count}} élément",
    font: "Police",
    fonts: "Polices",
    forward_subject_prefix: "Tr. :",
    forwarded_count: "{{count}} transféré",
    forwarded_count_k: "{{count}}k transférés",
    forwarded_message_separator: "---------- Message transféré ----------",
    headers_copied: "En-têtes copiés",
    hide_headers: "Masquer les en-têtes",
    image: "Image",
    images: "Images",
    indexing_messages: "Indexation des messages...",
    message_download_status:
      "État du téléchargement des messages : {{done}} sur {{total}}",
    estimated_time_remaining: "Temps restant estimé : {{duration}}",
    download_paused: "Téléchargement en pause",
    pause_download_action: "Mettre en pause",
    resume_download_action: "Reprendre",
    insert_link_title: "Insérer un lien",
    last_forwarded: "Dernier : {{ date }}",
    link_text_optional: "Texte du lien (facultatif)",
    links_cleaned: "Liens nettoyés",
    links_cleaned_count: "{{count}} lien(s) nettoyé(s)",
    load_external_content: "Charger le contenu externe",
    location_label: "Emplacement",
    message_details: "Détails du message",
    message_headers: "En-têtes du message",
    message_id_label: "Identifiant du message",
    more_folders_count: "{{count}} dossier(s) supplémentaire(s)",
    n_blocked: "{{count}} bloqué(s)",
    n_forwarded: "{{count}} transféré(s)",
    n_messages: "{{count}} message(s)",
    no_emails_match_query: "Aucun e-mail ne correspond à “{{query}}”",
    showing_results_for: "Résultats pour “{{corrected}}”",
    search_instead_for: "Rechercher “{{original}}” à la place",
    no_raw_headers: "Aucun en-tête brut disponible",
    no_trackers_detected: "Aucun traqueur détecté",
    no_trackers_found: "Aucun traqueur trouvé",
    notification_mention: "{{ sender }} vous a mentionné",
    notification_new_email: "Nouvel e-mail de {{ sender }}",
    notification_reply: "{{ sender }} a répondu",
    older_message: "Message plus ancien",
    older_messages: "{{count}} messages plus anciens",
    op_after_date: "Après le",
    op_before_date: "Avant le",
    op_exclude_sender: "Exclure l'expéditeur",
    op_from_last_month: "Le mois dernier",
    op_from_last_week: "La semaine dernière",
    op_from_this_month: "Ce mois-ci",
    op_from_this_week: "Cette semaine",
    op_from_today: "Aujourd'hui",
    op_from_yesterday: "Hier",
    op_has_archive: "A une archive",
    op_has_attachments: "A des pièces jointes",
    op_has_audio: "A un fichier audio",
    op_has_document: "A un document",
    op_has_image: "A une image",
    op_has_pdf: "A un PDF",
    op_has_spreadsheet: "A une feuille de calcul",
    op_has_video: "A une vidéo",
    op_in_drafts: "Dans les brouillons",
    chip_any_time: "N'importe quand",
    chip_older_than_week: "Plus d'une semaine",
    chip_older_than_month: "Plus d'un mois",
    chip_older_than_six_months: "Plus de 6 mois",
    chip_older_than_year: "Plus d'un an",
    chip_custom_range: "Période personnalisée",
    chip_has_attachment: "Avec pièce jointe",
    chip_attachment_image: "Image",
    chip_attachment_document: "Document",
    chip_attachment_pdf: "PDF",
    chip_attachment_video: "Vidéo",
    chip_is_unread: "Non lu",
    chip_name_or_email: "Nom ou e-mail",
    chip_no_people: "Aucune personne correspondante",
    chip_advanced_search: "Recherche avancée",
    spam_trash_hidden_notice:
      "Certains messages dans Spam et Corbeille correspondent à votre recherche.",
    search_index_incomplete:
      "Une partie de votre index de recherche n’a pas pu être lue sur cet appareil, donc certains messages peuvent manquer dans ces résultats.",
    view_spam_trash_messages: "Voir les messages",
    search_scope_anywhere: "Messages, spam et corbeille",
    op_in_anywhere: "Partout, y compris spam et corbeille",
    op_in_inbox: "Dans la boîte de réception",
    op_in_sent: "Dans les envoyés",
    op_in_trash: "Dans la corbeille",
    op_larger_than: "Plus grand que",
    op_read_emails: "E-mails lus",
    op_search_by_folder: "Rechercher par dossier",
    op_search_by_label: "Rechercher par étiquette",
    op_search_by_message_id: "Rechercher par identifiant",
    op_search_by_recipient: "Rechercher par destinataire",
    op_search_by_sender: "Rechercher par expéditeur",
    op_search_filename: "Rechercher par nom de fichier",
    op_search_in_subject: "Rechercher dans l'objet",
    op_size_range: "Plage de taille",
    op_smaller_than: "Plus petit que",
    op_starred_emails: "E-mails étoilés",
    op_unread_emails: "E-mails non lus",
    op_without_attachments: "Sans pièces jointes",
    open_unsubscribe_page: "Ouvrir la page de désinscription",
    param_removed_from_n_links: "{{param}} supprime de {{count}} lien(s)",
    remote_content_blocked: "Contenu distant bloqué",
    remote_images_blocked_count: "{{count}} image(s) distante(s) bloquée(s)",
    reply_quote_header: "Le {{date}}, {{name}} a écrit :",
    reply_subject_prefix: "Rép. :",
    reply_from_mismatch_title: "Répondre depuis une autre adresse ?",
    reply_from_mismatch_message:
      "Cet e-mail a été reçu sur {{ received }}, mais votre réponse sera envoyée depuis {{ selected }}. Répondre depuis une autre adresse peut la révéler à l'expéditeur et la réponse peut être rejetée.",
    reply_from_mismatch_use_received: "Utiliser l'adresse de réception",
    reply_from_mismatch_send_anyway: "Envoyer quand même",
    search_date_within: "Dans les",
    search_does_not_have: "Ne contient pas",
    search_from_placeholder: "nom@exemple.com",
    search_has_words: "Contient les mots",
    search_section_message: "Message",
    search_section_filters: "Filtres",
    search_message_content: "Contenu du message",
    search_message_content_help: "Rechercher dans le contenu des messages",
    search_message_content_help_body:
      "Activez cette option pour rechercher dans le texte complet des messages chiffrés.",
    search_placeholder_hint: "Rechercher des e-mails...",
    search_scope_all: "Tout",
    search_scope_label: "Portée de la recherche",
    search_size_greater: "Plus grand que",
    search_size_label: "Taille",
    search_size_less: "Plus petit que",
    search_size_op: "Opérateur de taille",
    search_size_unit: "Unité",
    search_to_placeholder: "nom@exemple.com",
    search_within_1_day: "1 jour",
    search_within_1_month: "1 mois",
    search_within_1_week: "1 semaine",
    search_within_1_year: "1 an",
    search_within_2_weeks: "2 semaines",
    search_within_3_days: "3 jours",
    search_within_3_months: "3 mois",
    search_within_6_months: "6 mois",
    search_within_any: "N'importe quand",
    searching_message_content: "Rechercher dans le contenu",
    search_taking_too_long: "La recherche prend trop de temps",
    search_refine_terms:
      "Essayez d'affiner votre recherche avec des termes plus précis.",
    refine_your_search_action: "Affiner votre recherche",
    turn_off_indexing_action: "Désactiver l'indexation",
    content_search_slower:
      "La recherche dans le contenu des messages peut être lente sur les grandes boîtes mail.",
    select_all_in_folder:
      "Sélectionner toutes les {{ count }} conversations dans {{ folder }}",
    shortcut_next_email: "E-mail suivant",
    show_headers: "Afficher les en-têtes",
    show_trimmed_content: "Afficher le contenu tronqué",
    size_label: "Taille",
    spam_auto_delete_notice:
      "Les éléments du spam seront automatiquement supprimés après {{ days }} jours.",
    trash_auto_delete_notice_family:
      "Les éléments de la corbeille seront automatiquement supprimés après {{ days }} jours (défini par l'administrateur de la famille).",
    spam_auto_delete_notice_family:
      "Les éléments du dossier spam seront automatiquement supprimés après {{ days }} jours (défini par l'administrateur de la famille).",
    spy_pixels_blocked: "Pixels espions bloqués",
    spy_pixels_blocked_count: "{{count}} pixel(s) espion(s) bloqué(s)",
    stylesheet: "Feuille de style",
    to_recipients_prefix: "à {{ recipients }}",
    received_on_prefix: "reçu sur {{ address }}",
    received_via_alias: "remis à votre alias {{ address }}",
    tracker: "Traqueur",
    tracker_domain: "{{domain}}",
    trackers: "Traqueurs",
    trackers_found: "{{count}} traqueur(s) trouvé(s)",
    tracking_protection: "Protection contre le suivi",
    tracking_protection_description:
      "Les liens de suivi et les pixels espions ont été bloqués.",
    trash_auto_delete_notice:
      "Les éléments de la corbeille seront automatiquement supprimés après {{ days }} jours.",
    try_adjusting_filters: "Essayez d'ajuster vos filtres",
    url_label: "URL",
    verification_invalid: "Signature invalide",
    verification_no_keys: "Aucune clé disponible",
    official_sender: "Adresse officielle Aster",
    official_sender_desc:
      "Ce message provient d'une adresse officielle Aster. Aster ne vous demandera jamais votre mot de passe ni votre phrase de récupération par e-mail.",
    verification_verified: "Vérifié",
    zero_access_encrypted: "Chiffré sans accès",
    sort_by: "Trier par",
    newest_first: "Plus récents d’abord",
    oldest_first: "Plus anciens d’abord",
    archive_conversation_count: "Archiver la conversation ({{count}} messages)",
    move_conversation_to_trash_count:
      "Déplacer la conversation vers la corbeille ({{count}} messages)",
    translation_unsupported: "{{language}} n’est pas encore pris en charge.",
    translation_unsupported_info_title:
      "Pourquoi ce message n’a pas été traduit",
    translation_unavailable_info_title:
      "Pourquoi ce message n’a pas été traduit",
    translation_unsupported_info_body:
      "La traduction s’effectue entièrement sur votre appareil, elle ne fonctionne donc qu’avec les packs de langue fournis par Aster. Il n’existe pas encore de pack pour {{language}}, et rien n’a été envoyé à un serveur.",
    translation_unsupported_info_body_list:
      "La traduction s’effectue entièrement sur votre appareil, elle ne fonctionne donc qu’avec les packs de langue fournis par Aster. Il n’existe pas encore de pack pour {{language}}. Disponibles pour l’instant : {{languages}}. Rien n’a été envoyé à un serveur.",
    translation_unavailable_info_body:
      "Le traducteur intégré à l’appareil n’a pas pu terminer ce message. En général, le pack de langue est encore en cours de téléchargement, le message mélange plusieurs langues, ou il se compose surtout de noms, de chiffres et de liens. Rien n’a été envoyé à un serveur.",
    more_folders_count_one: "+{{count}} autre dossier",
    more_folders_count_other: "+{{count}} autres dossiers",
    trackers_found_one: "{{count}} traqueur détecté et bloqué",
    trackers_found_other: "{{count}} traqueurs détectés et bloqués",
    spy_pixels_blocked_count_one: "{{count}} pixel espion bloqué",
    spy_pixels_blocked_count_other: "{{count}} pixels espions bloqués",
    links_cleaned_count_one: "{{count}} lien nettoyé",
    links_cleaned_count_other: "{{count}} liens nettoyés",
    param_removed_from_n_links_one: "{{param}} retiré de {{count}} lien",
    param_removed_from_n_links_other: "{{param}} retiré de {{count}} liens",
    remote_images_blocked_count_one: "{{count}} image distante bloquée",
    remote_images_blocked_count_other: "{{count}} images distantes bloquées",
  },
  auth: {
    passkey_verification: "Vérifier avec une clé d'accès",
    use_passkey_or_key:
      "Utilisez Windows Hello, Face ID ou votre clé de sécurité",
    use_passkey_instead: "Utiliser une clé d'accès à la place",
    sign_in: "Se connecter",
    sign_out: "Se déconnecter",
    sign_up: "S'inscrire",
    your_accounts: "Vos comptes",
    greeting: "Bonjour, {{name}}",
    greeting_morning: "Bonjour",
    greeting_afternoon: "Bon après-midi",
    greeting_evening: "Bonsoir",
    greeting_comma: ",",
    greeting_night: "Encore debout",
    manage_account: "Paramètres du compte",
    official_account: "Compte officiel",
    sign_out_all: "Se déconnecter de tous les comptes",
    session_expired_tag: "Session expirée",
    default_account: "Par défaut",
    storage_of_used: "{{used}} sur {{total}} utilisés",
    hide_more_accounts: "Masquer les autres comptes",
    show_more_accounts: "Afficher les autres comptes",
    change_photo: "Changer la photo",
    active_account: "Actif",
    add_another_account: "Ajouter un autre compte",
    switch_to_account: "Basculer vers ce compte",
    remove_account: "Retirer de cet appareil",
    remove_account_title: "Retirer le compte ?",
    remove_account_message:
      "{{email}} sera déconnecté de cet appareil. Vos données sur le serveur ne sont pas affectées.",
    confirm_remove_account: "Retirer",
    account_limit_for_plan:
      "Votre formule autorise jusqu'à {{max}} comptes connectés. Passez à une formule supérieure pour en ajouter plus.",
    signing_out_current: "Déconnexion...",
    email: "E-mail",
    password: "Mot de passe",
    confirm_password: "Confirmer le mot de passe",
    forgot_password: "Mot de passe oublié ?",
    reset_password: "Réinitialiser le mot de passe",
    remember_me: "Se souvenir de moi",
    create_account: "Créer un compte",
    already_have_account: "Vous avez déjà un compte ?",
    dont_have_account: "Vous n'avez pas de compte ?",
    terms_of_service: "Conditions d'utilisation",
    privacy_policy: "Politique de confidentialité",
    agree_terms:
      "J'accepte les Conditions d'utilisation et la Politique de confidentialité",
    username: "Nom d'utilisateur",
    sign_in_to_aster: "Se connecter à Aster",
    enter_credentials: "Saisissez vos identifiants pour accéder à votre compte",
    signing_in: "Connexion...",
    keep_signed_in: "Rester connecté",
    secure_devices_only: "uniquement sur des appareils sécurisés",
    back_to_inbox: "Retour à la boîte de réception",
    enter_password_placeholder: "Saisir votre mot de passe",
    authenticating: "Authentification...",
    fetching_auth_data: "Récupération des données d'authentification...",
    verifying_credentials: "Vérification des identifiants...",
    decrypting_vault: "Déchiffrement de votre coffre-fort de clés...",
    getting_user_info: "Récupération des informations utilisateur...",
    enter_backup_code: "Saisir le code de secours",
    backup_code_length_error:
      "Un code de secours fait 12 caractères (8 pour les anciens codes). Vérifier votre saisie suffit en général.",
    two_fa_temporarily_locked:
      "Trop de tentatives échouées. La vérification en deux étapes est bloquée pendant environ 15 minutes.",
    two_fa_code_already_used:
      "Ce code vient d'être utilisé. Attendez que votre application d'authentification affiche un nouveau code, puis réessayez.",
    too_many_2fa_attempts:
      "Trop de tentatives 2FA. Veuillez patienter quelques minutes avant de réessayer.",
    sign_in_session_expired:
      "Votre session de connexion a expiré. Revenez en arrière et reconnectez-vous.",
    back_to_link_device: "Retour à Associer un appareil",
    backup_codes_remaining_after_login: "{{count}} codes de secours restants",
    backup_code_description:
      "Saisissez un de vos codes de secours pour vous connecter",
    backup_code_single_use:
      "Chaque code de secours ne peut être utilisé qu'une seule fois",
    backup_code_placeholder: "XXXX-XXXX-XXXX",
    use_authenticator_instead:
      "Utiliser l'application d'authentification à la place",
    two_factor_auth_title: "Authentification à deux facteurs",
    enter_2fa_code:
      "Saisissez le code à 6 chiffres de votre application d'authentification",
    use_backup_code_instead: "Utiliser un code de secours à la place",
    recovery_codes_warning:
      "Sans codes de récupération, personne ne peut vous redonner accès à ce compte si vous oubliez votre mot de passe, et vos données chiffrées seraient perdues pour de bon. Continuer sans les enregistrer ?",
    create_aster_account: "Créez votre compte Aster",
    create_your_free_account: "Créez votre compte gratuit",
    one_account_all_services:
      "Un seul compte pour tous les services Aster. Gratuit, sécurisé et privé.",
    create_free_account: "Créer un compte gratuit",
    sign_in_existing: "Se connecter à un compte existant",
    choose_email_address: "Choisissez votre adresse e-mail",
    pick_unique_username:
      "Choisissez un nom d'utilisateur unique pour votre nouvel e-mail Aster",
    new_email_address: "Nouvelle adresse e-mail",
    your_new_aster_address: "Votre nouvelle adresse Aster Mail",
    generate_random_username: "Générer un nom d'utilisateur aléatoire",
    generate_random_display: "Générer un nom d'affichage aléatoire",
    profile_color: "Couleur du profil",
    preview_avatar: "Aperçu de votre avatar de profil",
    secure_your_account: "Sécurisez votre compte",
    create_strong_password:
      "Créez un mot de passe fort pour protéger votre compte",
    choose_your_plan: "Choisissez votre forfait",
    setting_up_account: "Configuration de votre compte",
    save_recovery_codes: "Sauvegardez vos codes de récupération",
    store_codes_safely:
      "Conservez ces codes en lieu sûr. Ils sont le SEUL moyen de récupérer votre compte si vous oubliez votre mot de passe.",
    download_key: "Télécharger la clé",
    download_as_text: "Télécharger en texte",
    recovery_download_failed: "Échec du téléchargement. Veuillez réessayer.",
    add_backup_email: "Ajouter un e-mail de secours",
    skip_for_now: "Passer pour le moment",
    recovery_email_required_gate_title:
      "Adresse e-mail de récupération requise",
    recovery_email_required_gate_desc:
      "Une adresse e-mail de récupération est requise pour créer un compte supplémentaire. Cela aide à protéger tous vos comptes.",
    username_min_length: "Au moins 3 caractères fonctionneront ici.",
    username_max_length: "Moins de 40 caractères fonctionneront ici.",
    username_alphanumeric:
      "Utilisez des lettres, des chiffres et des points. Les points ne peuvent pas être au début, à la fin, ni doublés.",
    username_not_available:
      "Ce nom d'utilisateur est pris. Un autre devrait fonctionner.",
    password_req_length: "Au moins 8 caractères",
    password_req_uppercase: "Une lettre majuscule",
    password_req_lowercase: "Une lettre minuscule",
    password_req_number: "Un chiffre",
    password_max_length_register: "Moins de 128 caractères fonctionneront ici.",
    password_invalid_chars:
      "Les caractères standard du clavier sont l'ensemble autorisé.",
    passwords_do_not_match_register:
      "Les deux mots de passe ne correspondent pas. Les saisir à nouveau devrait régler la chose.",
    registration_failed:
      "L'inscription ne s'est pas terminée. Recommencer et réessayer suffit en général. Aucun compte n'a été créé.",
    recovery_codes_copied: "Codes de récupération copiés",
    recovery_code_copied: "Code de récupération copié",
    click_eye_reveal:
      "Cliquez sur l'icône en forme d'œil pour révéler les codes d'abord",
    continue_without_download: "Continuer sans télécharger",
    please_enter_recovery_email:
      "Un courriel de récupération est la façon de récupérer l'accès si vous oubliez votre mot de passe.",
    please_enter_valid_email:
      "Cela ne ressemble pas à un courriel valide. Quelque chose comme nom@example.com fonctionnera.",
    recovery_email_conflict:
      "Cette adresse protège déjà le maximum de 20 comptes Aster. Utilisez une autre adresse.",
    failed_save_recovery_email:
      "Votre courriel de récupération ne s'est pas enregistré. Un autre essai devrait suffire. Votre configuration de récupération actuelle est inchangée.",
    recovery_phrase_title: "Sauvegardez votre phrase de récupération",
    recovery_phrase_desc:
      "Ces 12 mots sont le seul moyen de restaurer entièrement votre compte et tous vos courriels chiffrés si vous oubliez un jour votre mot de passe. Notez-les dans l'ordre et conservez-les en lieu sûr, hors ligne.",
    recovery_phrase_copied: "Phrase de récupération copiée",
    recovery_phrase_reveal:
      "Cliquez sur l'icône en forme d'œil pour révéler votre phrase d'abord",
    recovery_phrase_saved_checkbox:
      "J'ai sauvegardé ma phrase de récupération en lieu sûr",
    recovery_phrase_skip_warning:
      "Sans votre phrase de récupération, oublier votre mot de passe signifie perdre définitivement vos courriels chiffrés et vos alias. Continuer sans l'enregistrer ?",
    recovery_phrase_confirm_title: "Confirmez votre phrase de récupération",
    recovery_phrase_confirm_desc:
      "Sélectionnez les bons mots pour confirmer que vous avez sauvegardé votre phrase.",
    recovery_phrase_confirm_word_prompt: "Mot n°{n}",
    recovery_phrase_confirm_error:
      "Un ou plusieurs mots ne correspondent pas. Vérifiez votre phrase sauvegardée et réessayez.",
    recovery_phrase_skip_check:
      "Je l'ai sauvegardée, ignorer cette vérification",
    forgot_method_title: "Comment souhaitez-vous récupérer votre compte ?",
    forgot_method_desc:
      "La méthode choisie détermine si vos données chiffrées peuvent être restaurées.",
    forgot_method_full_restore: "Restauration complète",
    forgot_method_access_only: "Accès uniquement",
    forgot_method_phrase_title: "Utiliser ma phrase de récupération",
    forgot_method_phrase_desc:
      "Saisissez votre phrase de 12 mots. Tous vos courriels, alias et paramètres sont restaurés.",
    forgot_method_code_title: "Utiliser un code de récupération",
    forgot_method_code_desc:
      "Saisissez l'un de vos codes de récupération ASTER. Tous vos courriels, alias et paramètres sont restaurés.",
    forgot_method_email_title: "M'envoyer un lien de réinitialisation",
    forgot_method_email_desc:
      "Retrouvez l'accès à votre compte. Les courriels chiffrés antérieurs à la réinitialisation ne pourront plus être lus, sauf si vous retrouvez plus tard votre phrase ou un code.",
    phrase_entry_title: "Saisissez votre phrase de récupération",
    phrase_entry_desc: "Tapez ou collez les 12 mots dans l'ordre.",
    phrase_entry_invalid:
      "Ce n'est pas une phrase de récupération valide. Vérifiez les mots et leur ordre.",
    phrase_recovery_failed:
      "Cette phrase ne correspond pas à ce compte. Vérifiez les mots et l'adresse de courriel.",
    reset_consent_title:
      "Cette réinitialisation ne peut pas déchiffrer vos anciennes données",
    reset_consent_keeps:
      "Vous conservez : votre adresse de courriel, tous vos alias (le courrier continue d'arriver), votre abonnement et votre compte.",
    reset_consent_loses:
      "Vous perdez l'accès à : tous les courriels chiffrés, contacts, libellés d'alias et paramètres antérieurs à la réinitialisation. Ils restent stockés chiffrés et ne pourront être déverrouillés plus tard que si vous vous souvenez de votre ancien mot de passe.",
    reset_consent_last_chance:
      "Avez-vous votre phrase de récupération ou un code de récupération ? L'un ou l'autre restaure tout.",
    reset_consent_use_phrase_instead: "Utiliser plutôt ma phrase ou un code",
    reset_consent_checkbox:
      "Je comprends que mes données chiffrées seront illisibles après cette réinitialisation",
    reset_consent_type_email:
      "Saisissez votre adresse de courriel complète pour confirmer",
    reset_consent_email_mismatch:
      "L'adresse de courriel ne correspond pas à ce compte.",
    reset_consent_continue: "Réinitialiser le mot de passe malgré tout",
    plan_starter_badge: "Starter",
    plan_personal_badge: "Personnel",
    plan_pro_badge: "Pro",
    perfect_personal_use: "Parfait pour un usage personnel",
    everything_to_start: "Tout ce dont vous avez besoin pour commencer",
    for_power_users: "Pour les utilisateurs avancés",
    e2e_encrypted_inbox: "Boîte de réception chiffrée de bout en bout",
    zero_knowledge_encryption: "Chiffrement à connaissance nulle",
    unlimited_emails: "E-mails illimités",
    no_ads_no_tracking: "Pas de publicité, pas de suivi",
    use_8_characters: "Utilisez au moins 8 caractères",
    try_12_characters: "Essayez 12+ caractères pour une meilleure sécurité",
    mix_case: "Mélangez majuscules et minuscules",
    add_numbers: "Ajoutez quelques chiffres",
    password_weak: "Faible",
    password_fair: "Moyen",
    password_good: "Bon",
    password_strong: "Fort",
    please_enter_email_address: "Votre courriel est nécessaire ici.",
    please_enter_recovery_code:
      "L'un de vos codes de récupération est nécessaire ici.",
    invalid_recovery_code:
      "Ce code de récupération ne correspondait pas. Un autre de votre liste enregistrée devrait fonctionner.",
    recovery_locked_out:
      "Ce compte a fait l'objet de trop de tentatives de récupération. Vous pouvez réessayer dans {{time}}. Aucun de vos codes n'a été utilisé, vous les avez donc tous encore.",
    invalid_backup_code:
      "Ce code de secours ne correspond pas. Chaque code ne sert qu'une fois, essayez donc le suivant non utilisé de votre liste.",
    new_password_placeholder: "Nouveau mot de passe",
    confirm_password_placeholder: "Confirmer le mot de passe",
    email_address_placeholder: "Adresse e-mail",
    recovery_failed:
      "La récupération ne s'est pas terminée. Recommencer suffit en général. Votre compte est inchangé.",
    add_special_characters: "Ajoutez des caractères spéciaux (!@#$%)",
    recovery_codes_start_with_aster:
      "Les codes de récupération commencent par 'ASTER-'",
    verifying_recovery_code: "Vérification du code de récupération...",
    recovery_session_expired:
      "Cette session de récupération s'est terminée. Recommencer le processus de récupération la reprendra. Votre compte est inchangé.",
    recovering_account_data: "Récupération des données du compte...",
    generating_new_encryption_keys:
      "Génération de nouvelles clés de chiffrement...",
    creating_new_recovery_codes:
      "Création de nouveaux codes de récupération...",
    encrypting_vault_new_password:
      "Chiffrement du coffre-fort avec le nouveau mot de passe...",
    creating_new_recovery_backup:
      "Création d'une nouvelle sauvegarde de récupération...",
    saving_new_credentials: "Enregistrement des nouveaux identifiants...",
    recover_your_account: "Récupérer votre compte",
    enter_email_associated:
      "Entrez votre nom d'utilisateur pour récupérer votre compte",
    back_to_sign_in: "Retour à la connexion",
    email_me_reset_link: "M'envoyer un lien de réinitialisation par e-mail",
    have_recovery_code: "Vous avez un code de récupération ?",
    use_recovery_code: "Utiliser un code de récupération à la place",
    reset_link_sent_title: "Vérifiez votre e-mail de récupération",
    reset_link_sent_desc:
      "Si ce nom d'utilisateur est enregistré et possède un e-mail de récupération vérifié, un lien de réinitialisation du mot de passe a été envoyé. Le lien expire dans 30 minutes.",
    sending_reset_link: "Envoi du lien de réinitialisation...",
    no_recovery_email_on_account:
      "Ce compte n'a pas d'e-mail de récupération vérifié. Utilisez un code de récupération pour réinitialiser votre mot de passe.",
    reset_your_password: "Réinitialiser votre mot de passe",
    reset_choose_new_password:
      "Choisissez un nouveau mot de passe pour votre compte.",
    reset_invalid_or_expired:
      "Ce lien de réinitialisation est invalide ou a expiré. Veuillez en demander un nouveau.",
    request_new_reset_link: "Demander un nouveau lien de réinitialisation",
    set_new_password: "Définir le nouveau mot de passe",
    resetting_password: "Réinitialisation du mot de passe...",
    enter_recovery_code: "Saisir le code de récupération",
    enter_recovery_code_desc:
      "Saisissez un des codes de récupération que vous avez sauvegardés lors de la création de votre compte",
    verify_code: "Vérifier le code",
    create_new_password: "Créer un nouveau mot de passe",
    choose_strong_password: "Choisissez un mot de passe fort pour votre compte",
    recovering_your_account: "Récupération de votre compte",
    please_dont_close:
      "Veuillez ne pas fermer cette fenêtre pendant la récupération de votre compte.",
    save_new_recovery_codes: "Sauvegardez vos nouveaux codes de récupération",
    old_codes_invalidated:
      "Vos anciens codes de récupération ne fonctionnent plus. Enregistrer ce nouvel ensemble dans un endroit sûr avant de fermer cette fenêtre vous gardera couvert.",
    n_recovery_codes: "{{count}} codes de récupération",
    password_reset_successful: "Réinitialisation du mot de passe réussie",
    account_recovered_sign_in:
      "Votre compte a été récupéré. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.",
    check_your_inbox: "Vérifiez votre boîte de réception",
    generating_encryption_keys: "Génération des clés de chiffrement...",
    creating_identity_keypair: "Création de la paire de clés d'identité...",
    creating_signed_prekey: "Création de la clé pré-signée...",
    generating_recovery_codes: "Génération des codes de récupération...",
    encrypting_key_vault: "Chiffrement du coffre-fort de clés...",
    creating_recovery_backup: "Création de la sauvegarde de récupération...",
    preparing_pgp_key: "Préparation de la clé PGP...",
    creating_your_account: "Création de votre compte...",
    by_continuing: "En continuant, vous acceptez nos",
    copyright: "© {{year}} Aster Communications Inc.",
    display_name_optional: "Nom d'affichage (optionnel)",
    "10gb_secure_storage": "10 Go de stockage sécurisé",
    "5_email_aliases": "5 alias e-mail",
    "2_custom_domains": "2 domaines personnalisés",
    "50mb_attachments": "Pièces jointes de 50 Mo",
    plan_free_price: "Gratuit",
    "50gb_secure_storage": "50 Go de stockage sécurisé",
    "10_email_aliases": "10 alias e-mail",
    "5_custom_domains": "5 domaines personnalisés",
    "100mb_attachments": "Pièces jointes de 100 Mo",
    compare_all_features: "Comparer toutes les fonctionnalités",
    encryption_keys_local:
      "Vos clés de chiffrement sont stockées localement sur cet appareil et ne sont jamais envoyées à nos serveurs.",
    optional_backup_email_desc:
      "Ajoutez un e-mail de récupération d'un autre fournisseur. C'est optionnel mais recommandé pour la récupération de compte.",
    verification_email_sent_to_desc:
      "Nous avons envoyé un lien de vérification à {{email}}. Cliquez sur le lien pour vérifier.",
    waiting_for_verification: "En attente de vérification...",
    resend_verification_email: "Renvoyer l'e-mail de vérification",
    resend_in_seconds: "Renvoyer dans {{seconds}}s",
    skip_verification: "Passer la vérification",
    recovery_email_required_notice:
      "Un e-mail de récupération est requis pour prévenir le spam.",
    abuse_account_limit:
      "Notre système de sécurité automatisé a signalé cette inscription, et nous ne pouvons pas créer le compte. Si cela semble être une erreur, hello@astermail.org peut vous aider.",
    abuse_flagged_message:
      "Notre système de sécurité a arrêté pour l'instant les nouvelles inscriptions depuis ce réseau. Si cela semble être une erreur, hello@astermail.org peut vous aider.",
    contact_support: "contacter le support",
    recovery_email_verified: "E-mail de récupération vérifié",
    verification_failed: "La vérification ne s'est pas terminée.",
    go_to_inbox: "Aller à la boîte de réception",
    end_to_end_encrypted: "Chiffrement de bout en bout",
    zero_knowledge: "Architecture zéro accès",
    zero_knowledge_desc:
      "Nous ne pouvons jamais lire vos e-mails ni vos données",
    password_never_stored: "Mot de passe jamais stocké",
    password_never_stored_desc:
      "Seul un hachage de clé dérivée est utilisé pour l'authentification",
    recovery_codes_important: "Conservez-les en lieu sûr",
    recovery_backup_tip: "Conseil de sauvegarde",
    onboarding_appearance_title: "Personnalisez votre boîte de réception",
    onboarding_theme_light: "Clair",
    onboarding_theme_dark: "Sombre",
    onboarding_view_mode_label: "Disposition de lecture",
    onboarding_view_popup: "Pop-up",
    onboarding_view_popup_desc: "Ouvre les e-mails dans une fenêtre flottante",
    onboarding_view_split: "Vue partagée",
    onboarding_view_split_desc: "Liste des e-mails et contenu côte à côte",
    onboarding_view_fullpage: "Pleine page",
    onboarding_view_fullpage_desc: "Consacre tout l'écran à chaque e-mail",
    onboarding_compact_mode: "Mode compact",
    onboarding_compact_mode_desc:
      "Espacement réduit pour afficher plus d'e-mails",
    onboarding_continue_btn: "Continuer",
    onboarding_privacy_title: "Confidentialité et sécurité",
    onboarding_block_tracking: "Bloquer les pixels de suivi",
    onboarding_block_external: "Bloquer le contenu externe",
    onboarding_read_receipts: "Bloquer les accusés de réception",
    onboarding_warn_external: "Avertir pour les destinataires externes",
    onboarding_auto_keys: "Découverte automatique des clés",
    onboarding_encrypt_emails: "Chiffrer par défaut",
    onboarding_session_timeout: "Expiration de session",
    recovery_email_verified_desc:
      "Votre e-mail de récupération a été vérifié avec succès et associé à votre compte.",
    verification_failed_desc:
      "Ce lien a expiré ou ne correspond plus. Un nouveau courriel de vérification depuis les paramètres de votre compte fonctionnera.",
    recovery_codes_important_desc:
      "Ces codes sont le seul moyen de récupérer votre compte si vous perdez votre mot de passe. Conservez-les dans un endroit sûr.",
    recovery_backup_tip_desc:
      "Enregistrez vos codes dans un gestionnaire de mots de passe ou imprimez-les et conservez-les en lieu sûr.",
    onboarding_appearance_desc:
      "Choisissez un style qui vous convient. Vous pouvez les modifier à tout moment.",
    onboarding_privacy_desc:
      "Votre boîte de réception, vos règles. Ajustez ces paramètres selon votre niveau de confort.",
    onboarding_block_tracking_desc:
      "Empêchez les expéditeurs de savoir quand vous ouvrez leurs e-mails",
    onboarding_block_external_desc:
      "Bloquez les images et contenus distants qui pourraient vous suivre",
    onboarding_read_receipts_desc:
      "Ne laissez pas les expéditeurs savoir quand vous avez ouvert leurs e-mails",
    onboarding_warn_external_desc:
      "Afficher un avertissement lors de l'envoi à des adresses non-Aster",
    onboarding_auto_keys_desc:
      "Trouver automatiquement les clés de chiffrement des contacts auxquels vous écrivez",
    onboarding_encrypt_emails_desc:
      "Chiffrer automatiquement les e-mails sortants lorsque la clé du destinataire est disponible",
    onboarding_session_timeout_desc:
      "Verrouiller automatiquement votre compte après une période d'inactivité",
    browser_login_sign_in_password:
      "Se connecter avec un mot de passe à la place",
    log_in: "Se connecter",
    welcome_subtitle:
      "Une messagerie moderne, chiffrée pour vous et illisible pour tous les autres.",
    browser_login_generate_new: "Générer un nouveau code",
    browser_login_expires_in: "Expire dans ",
    browser_login_desc:
      "Ouvrez Aster Mail dans votre navigateur, allez dans Réglages et saisissez ce code pour associer votre téléphone.",
    browser_login_title: "Se connecter avec le navigateur",
    account_flagged_notice: "Votre compte a été signalé. Contactez le support.",
    backup_email_placeholder: "E-mail de secours",
    close_this_tab: "Fermer cet onglet",
    copy_email: "Copier l'e-mail",
    copy_failed: "Échec de la copie",
    device_code_copied: "Code copié",
    device_code_copy: "Copier le code",
    device_code_expired: "Code expiré",
    device_code_expired_description: "Ce code a expiré. Obtenez-en un nouveau.",
    device_code_expires_in: "Expire dans",
    device_code_get_new: "Obtenir un nouveau code",
    device_code_instruction:
      "Entrez ce code sur votre autre appareil pour vous connecter.",
    device_code_open_browser: "Ouvrir dans le navigateur",
    device_code_title: "Code d'appareil",
    device_code_waiting: "En attente de la vérification...",
    effective_date: "Date d'entrée en vigueur : {{date}}",
    email_copied: "E-mail copié",
    last_updated: "Dernière mise à jour : {{date}}",
    link_device_cancel: "Annuler",
    link_device_code_placeholder: "Code à 6 chiffres",
    link_device_confirm_button: "Confirmer",
    link_device_confirm_prompt: "Confirmer l'association de l'appareil ?",
    link_device_confirming: "Confirmation en cours...",
    link_device_desktop: "Associer un appareil de bureau",
    link_device_signed_in_as: "Connecté en tant que",
    link_device_enter_code: "Entrez le code affiché sur votre autre appareil.",
    link_device_expired_code: "Code expiré",
    link_device_failed: "Échec de la liaison de l'appareil",
    link_device_invalid_code: "Code invalide",
    link_device_success: "Appareil lié avec succès",
    link_device_success_description: "Cet appareil a accès à votre compte.",
    link_device_title: "Lier un appareil",
    link_device_try_again: "Réessayer",
    link_device_verify_button: "Vérifier",
    link_device_verifying: "Vérification...",
    pair_device_cancel: "Annuler",
    pair_device_confirm:
      "Voulez-vous associer {{ name }} à votre compte Aster Mail ?",
    pair_device_confirm_button: "Confirmer",
    pair_device_description:
      "Scannez le code QR avec votre application Aster pour associer cet appareil.",
    link_device_change_account: "Changer de compte",
    link_device_choose_account: "Choisissez un compte",
    link_device_choose_account_description:
      "Pour associer votre application de bureau",
    link_device_choose_account_note:
      "Vos clés de chiffrement ne quittent jamais vos appareils.",
    link_device_use_another_account: "Utiliser un autre compte",
    link_device_use_this_account: "Utiliser ce compte",
    link_device_other_accounts: "Passer à un autre compte",
    pair_device_failed: "Échec de l'association de l'appareil",
    pair_device_invalid: "Code d'association invalide",
    pair_device_open_app: "Ouvrir l'application",
    pair_device_success: "Appareil associé avec succès",
    pair_device_title: "Associer cet appareil",
    pair_device_warning:
      "Assurez-vous de faire confiance à cet appareil avant de continuer.",
    pair_this_device: "Associer cet appareil",
    plan_continue_as_free: "Continuer avec le forfait gratuit",
    academic_offer_title: "Étudiant ou journaliste ? 30 % de réduction",
    academic_offer_desc:
      "30 % de réduction sur les forfaits individuels pendant 12 mois. Étudiants : vérifiez votre e-mail universitaire maintenant, votre code sera prêt au paiement. Journalistes : contactez le support après l'inscription.",
    academic_offer_sent:
      "Lien de vérification envoyé à {{ email }}. Après le clic, votre code apparaîtra dans Paramètres, section Facturation.",
    academic_offer_journalist:
      "Journaliste ? Terminez l'inscription puis contactez le support avec votre carte de presse.",
    academic_offer_headline: "Étudiant ou journaliste ?",
    academic_offer_subline:
      "30 % de réduction sur Star, Nova et Supernova pendant un an. Étudiants : saisissez votre e-mail universitaire et nous vous envoyons un lien de vérification.",
    academic_offer_cta: "M'envoyer le lien de vérification",
    academic_offer_not_now: "Pas maintenant",
    academic_offer_journalist_link: "Je suis journaliste",
    academic_offer_student_link: "Je suis étudiant",
    academic_offer_sent_title: "Vérifiez votre boîte",
    academic_offer_continue: "Continuer",
    academic_offer_j_step1: "Terminez la création de votre compte",
    academic_offer_j_step2:
      "Écrivez à hello@astermail.org avec votre carte de presse, page d'équipe ou liens d'articles",
    academic_offer_j_step3:
      "Votre code de 30 % apparaîtra dans Paramètres, section Facturation",
    plan_continue_with_free: "Continuer gratuitement",
    plan_footer_reassurance: "Annulez à tout moment.",
    plan_free_cta: "Choisir le forfait gratuit",
    plan_duo_description:
      "Stockage chiffré partagé et une seule facture pour deux personnes.",
    plan_family_description:
      "Stockage chiffré partagé et une seule facture pour 6 personnes maximum.",
    plan_starter_description:
      "Plus de stockage et d'alias pour un usage personnel quotidien.",
    plan_pro_description:
      "Un stockage généreux et des alias pour les utilisateurs avancés.",
    plan_free_name: "Gratuit",
    plan_free_tagline: "Pour commencer",
    plan_loading: "Chargement des forfaits...",
    plan_nova_description: "Idéal pour un usage personnel.",
    plan_payment_success_continuing:
      "Paiement confirmé, configuration en cours...",
    plan_recommended: "Recommandé",
    plan_select: "Choisir",
    plan_selected: "Sélectionné",
    plan_selection_subtitle:
      "Commencez gratuitement ou choisissez un forfait premium.",
    plan_selection_title: "Choisissez votre forfait",
    plan_star_description: "Pour les utilisateurs avancés.",
    plan_supernova_description: "Pour les équipes et professionnels.",
    plan_view_full_features: "Voir toutes les fonctionnalités",
    privacy_policy_heading: "Politique de confidentialité",
    privacy_policy_intro: "Votre vie privée est importante pour nous.",
    registration_suspended: "L'inscription est temporairement suspendue.",
    security_key_verification: "Vérification par clé de sécurité",
    passkey_sign_in: "Se connecter avec une clé d’accès",
    tap_security_key: "Touchez votre clé de sécurité",
    terms_of_service_heading: "Conditions d'utilisation",
    terms_of_service_intro: "En utilisant Aster, vous acceptez ces conditions.",
    trust_this_device_30_days:
      "Faire confiance à cet appareil pendant 30 jours",
    use_another_method: "Utiliser une autre méthode",
    username_in_use: "Ce nom d'utilisateur est déjà pris.",
    password_breach_warning:
      "Ce mot de passe est apparu dans une fuite de données. Utilisez-en un autre de préférence.",
    verification_success_desc:
      "Votre adresse e-mail a été vérifiée avec succès.",
    verification_success_title: "E-mail vérifié",
    view_privacy_policy: "Voir la politique de confidentialité",
    view_terms_of_service: "Voir les conditions d'utilisation",
    waiting_for_pairing: "En attente de l'association...",
    webauthn_not_supported:
      "WebAuthn n'est pas pris en charge sur cet appareil.",
    remove_photo: "Supprimer la photo",
    captcha_load_failed:
      "Le contrôle de sécurité n’a pas pu se charger. Vérifiez votre connexion ou un éventuel bloqueur de contenu, puis réessayez.",
    academic_verified_signin_note:
      "Statut étudiant vérifié. Connectez-vous et votre remise de 30 % sera appliquée au paiement.",
    academic_failed_signin_note:
      "Ce lien de vérification a expiré ou a déjà été utilisé. Connectez-vous et demandez-en un nouveau dans les réglages de facturation.",
    link_device_upgrade_required_toast:
      "Associer un appareil Bridge nécessite un abonnement Star ou supérieur. Passez à un abonnement supérieur pour continuer.",
    link_device_upgrade_title:
      "Passez à un abonnement supérieur pour associer cet appareil",
    link_device_upgrade_description:
      "Connecter un Bridge d’ordinateur à votre compte nécessite un abonnement Star ou supérieur. Choisissez un abonnement ci-dessous et votre appareil sera associé juste après le paiement.",
    link_device_upgrade_cta: "Passer à Star",
    link_device_upgrade_failed:
      "Impossible de démarrer le paiement. Réessayez ou ouvrez Facturation dans les réglages.",
    link_device_already_linked:
      "Cet appareil est déjà associé à un autre compte. Dissociez-le d’abord, puis réessayez.",
    link_device_rate_limited:
      "Trop de tentatives. Patientez environ une minute, puis réessayez.",
    link_device_account_suspended:
      "Ce compte est suspendu, il n’est donc pas possible d’associer de nouveaux appareils pour l’instant. Contactez l’assistance pour régler la situation.",
    product_updates_notice:
      "Vous recevrez aussi de temps en temps des nouveautés produit dans votre boîte de réception, et vous pouvez les désactiver dans les réglages.",
    plan_academic_discount_note:
      "Votre remise de 30 % s’applique automatiquement au paiement dès que votre e-mail est vérifié.",
    plan_referral_discount_note:
      "Votre remise de parrainage s’applique automatiquement au paiement.",
    plan_referral_discount_percent_note:
      "Votre remise de parrainage de {{percent}} % est déjà appliquée ci-dessous.",
    academic_verified_title: "Vous êtes vérifié",
    academic_verified_body:
      "Votre remise étudiante de 30 % est confirmée. Direction vos abonnements...",
    academic_verified_continue: "Choisir votre abonnement",
    academic_offer_sending_title: "Envoi de votre lien de vérification",
    academic_offer_sending_body:
      "Envoi d’un lien de vérification pour la remise de 30 % à {{ email }}.",
    offer_welcome_badge_student: "30 % de remise étudiante",
    offer_welcome_badge_journalist: "30 % de remise journaliste",
    offer_welcome_headline: "Profitez de 30 % de remise",
    offer_welcome_subline_student:
      "Créez votre compte gratuit, puis vérifiez votre e-mail étudiant pour obtenir 30 % de remise sur tout abonnement payant pendant 12 mois.",
    offer_welcome_subline_journalist:
      "Créez votre compte gratuit, puis vérifiez votre carte de presse pour obtenir 30 % de remise sur tout abonnement payant pendant 12 mois.",
  },
  passkeys: {
    passkey_setup_cancelled: "Configuration de la clé d'accès annulée.",
    security_key_not_found:
      "Authentification annulée ou authentificateur de l'appareil non disponible.",
    no_platform_authenticator:
      "Windows Hello n'est pas configuré sur cet appareil. Accédez à Paramètres Windows > Comptes > Options de connexion pour ajouter un code PIN, une empreinte digitale ou la reconnaissance faciale.",
    saved_to_password_manager:
      "Clé d'accès enregistrée dans votre gestionnaire de mots de passe. Pour utiliser Windows Hello à la place, fermez la boîte de dialogue du gestionnaire de mots de passe lorsqu'elle apparaît.",
    passkey_hint:
      "Utilise Windows Hello, Face ID ou Touch ID. Si votre gestionnaire de mots de passe s'ouvre, vous pouvez l'y enregistrer ou mettre l'extension en pause pour utiliser Windows Hello directement.",
    security_key_hint:
      "Ajoute un second facteur via Windows Hello, un YubiKey ou votre gestionnaire de mots de passe.",
    section_title: "Clés d’accès et clés de sécurité",
    section_description:
      "Utilisez des clés d’accès pour vous connecter rapidement et en toute sécurité avec la biométrie ou le code de votre appareil. Les clés de sécurité utilisent l’authentificateur de votre appareil comme deuxième facteur.",
    add_passkey: "Ajouter une clé d’accès",
    add_security_key: "Ajouter une clé de sécurité",
    no_passkeys: "Aucune clé d’accès ni clé de sécurité enregistrée",
    passkey_badge: "Clé d’accès",
    security_key_badge: "Clé de sécurité",
    registered: "Ajoutée",
    last_used: "Dernière utilisation",
    never_used: "Jamais utilisée",
    remove: "Retirer",
    confirm_remove: "Retirer",
    delete_passkey_title: "Supprimer le passkey ?",
    delete_passkey_description:
      "« {{name}} » sera supprimé de votre compte. Vous ne pourrez plus l'utiliser pour vous connecter.",
    delete_security_key_title: "Supprimer la clé de sécurité ?",
    delete_security_key_description:
      "« {{name}} » sera supprimée de votre compte. Elle ne pourra plus servir de second facteur.",
    removed: "Clé d’accès supprimée",
    register_success: "Clé d’accès enregistrée",
    register_failed: "L’enregistrement a échoué. Réessayez.",
    registering: "Enregistrement…",
    not_supported:
      "Votre navigateur ne prend pas en charge les clés d’accès. Essayez un navigateur récent comme Chrome, Safari ou Firefox.",
    sign_in_with_passkey: "Se connecter avec une clé d’accès",
    authenticating: "Authentification…",
    vault_needs_password:
      "Saisissez votre mot de passe pour déchiffrer votre coffre pour la première fois.",
    unnamed_passkey: "Clé d’accès",
    unnamed_security_key: "Clé de sécurité",
    rename: "Renommer",
    rename_saved: "Nom mis à jour",
    rename_placeholder: "Nommez cette clé",
    rename_failed: "Impossible de renommer la clé. Réessayez.",
  },
  errors: {
    upload_too_large:
      "L'envoi est trop volumineux. Pour continuer, retirez ou réduisez un fichier, puis réessayez.",
    failed_remove_reaction:
      "Impossible de supprimer la réaction. Veuillez réessayer.",
    cannot_react_own_message:
      "Vous ne pouvez pas réagir à votre propre message.",
    cannot_react_draft:
      "Vous ne pouvez pas réagir à un brouillon ou à un message programmé.",
    cannot_react_spam_or_trash:
      "Vous ne pouvez pas réagir aux messages dans Spam ou Corbeille.",
    cannot_react_reply_to:
      "Vous ne pouvez pas réagir à un message avec une adresse de réponse.",
    cannot_react_too_many_recipients:
      "Vous ne pouvez pas réagir à un message avec plus de 20 destinataires.",
    cannot_react_bcc: "Vous ne pouvez pas réagir à un message reçu en Cci.",
    cannot_react_too_many_emojis:
      "Ce message a déjà atteint le nombre maximal de réactions.",
    cannot_react_no_recipient:
      "Ce message n'a pas d'expéditeur à qui envoyer la réaction.",
    failed_send_reaction:
      "La réaction n'a pas pu être envoyée. Veuillez réessayer.",
    reactions_disabled: "Les réactions sont désactivées dans vos paramètres.",
    pending_email_verification:
      "Consultez votre e-mail et cliquez sur le lien de vérification pour activer ce compte.",
    generic: "Cela n'a pas fonctionné. Un autre essai devrait suffire.",
    network:
      "Nous n'avons pas pu joindre le serveur. Vérifier votre connexion et réessayer suffit en général.",
    unauthorized:
      "Vous n'avez pas l'accès pour faire cela. Si cela semble être une erreur, votre administrateur peut aider.",
    not_found:
      "Nous n'avons pas pu trouver cela. Cela a peut-être été déplacé ou retiré.",
    validation: "Les champs surlignés méritent un autre coup d'œil.",
    server:
      "Le serveur a rencontré un souci de notre côté. Un autre essai sous peu suffit en général. Nous nous penchons dessus.",
    timeout:
      "La requête a pris trop de temps à se terminer. Vérifier votre connexion et réessayer suffit en général.",
    rate_limit:
      "Vous faites cela trop rapidement. Veuillez patienter un instant et réessayer.",
    invalid_credentials:
      "Ce courriel et ce mot de passe ne correspondaient pas. Un autre essai, ou une réinitialisation sur astermail.org/reset, réglera la chose.",
    session_expired:
      "Votre session s'est terminée. Vous reconnecter vous fera reprendre là où vous étiez. Vos données et brouillons sont enregistrés sur le serveur.",
    try_again: "Un autre essai devrait suffire.",
    sign_in_domain_unsupported:
      "Connectez-vous avec l'adresse astermail.org ou aster.cx utilisee lors de votre inscription. Les adresses sur votre propre domaine mènent au même compte.",
    invalid_username:
      "Un nom d'utilisateur entre 3 et 40 caractères fonctionnera ici.",
    enter_password: "Votre mot de passe est nécessaire pour continuer.",
    password_too_long:
      "Ce mot de passe dépasse la limite de longueur. Un plus court fonctionnera.",
    account_not_found:
      "Nous n'avons pas pu trouver un compte avec ce nom. Vérifier l'orthographe, ou une réinitialisation sur astermail.org/reset, suffit en général.",
    login_failed:
      "La connexion ne s'est pas terminée. Un autre essai devrait suffire. Votre compte n'est pas verrouillé.",
    decrypt_failed:
      "Ce mot de passe n'a pas déverrouillé vos clés sur cet appareil. Réessayer fonctionnera, et un code de récupération sur astermail.org/reset est la solution de secours si cela continue d'échouer. Vos données sur le serveur sont inchangées.",
    send_limit_reached:
      "Vous avez atteint votre limite d'envoi quotidienne. Un autre essai dans {{time}} fonctionnera. Votre brouillon est enregistré.",
    ip_blocked:
      "Trop de tentatives de connexion échouées d'ici. Une attente de {{time}} avant de réessayer réglera la chose. Votre compte n'est pas verrouillé.",
    an_error_occurred:
      "Cela n'a pas fonctionné. Un autre essai devrait suffire.",
    failed_to_block_sender:
      "Nous n'avons pas pu bloquer cet expéditeur. Un autre essai devrait suffire.",
    failed_to_snooze:
      "Ce message n'a pas été mis en veille. Un autre essai devrait suffire. Il est toujours dans votre boîte de réception.",
    ghost_alias_not_found:
      "Nous n'avons pas pu trouver l'adresse fantôme liée à ce fil.",
    failed_to_resolve_ghost_alias:
      "L'adresse fantôme de ce fil ne s'est pas chargée. Un autre essai devrait suffire.",
    ghost_alias_rate_limit:
      "Vous avez utilisé tous vos alias fantômes pour le mois. Mettre à niveau votre plan, ou attendre la réinitialisation du mois prochain, vous en donnera plus.",
    ghost_alias_already_exists:
      "Vous avez déjà cet alias fantôme sur votre compte.",
    failed_to_create_ghost_alias:
      "Cet alias fantôme ne s'est pas enregistré. Un autre essai devrait suffire. Vos autres alias sont inchangés.",
    ghost_expiry_extend_only:
      "Vous pouvez seulement prolonger une adresse ghost, pas la raccourcir.",
    ghost_expiry_update_failed:
      "L'expiration n'a pas été mise à jour. Réessayez.",
    failed_to_activate_ghost_mode:
      "Le mode fantôme ne s'est pas activé. Un autre essai devrait suffire.",
    wrong_vault_password:
      "Ce mot de passe n'a pas déverrouillé vos clés sur cet appareil. Un autre essai devrait suffire, et un code de récupération sur astermail.org/reset reste la solution de secours si cela échoue encore. Vos données sur le serveur sont inchangées.",
    vault_tampered:
      "Les données chiffrées sur cet appareil ne correspondent pas à ce que nous attendions, ce qui peut indiquer une altération. Rendez-vous dans Paramètres puis Sécurité pour vérifier, et si l'avertissement revient, contactez hello@astermail.org. Vos données sur le serveur restent intactes.",
    vault_version_drift:
      "Votre stockage chiffré provient d'une ancienne version d'Aster, et nous le mettons à niveau en ce moment. Vos données sont en sécurité et cela ne se produit qu'une seule fois.",
    vault_missing_key:
      "Nous n'avons pas trouvé la clé d'appareil nécessaire pour lire ce stockage. Vous déconnecter puis vous reconnecter re-liera cet appareil. Vos données sur le serveur restent intactes.",
    wrong_folder_password:
      "Ce mot de passe de dossier ne correspond pas. Un autre essai devrait suffire. Le dossier reste verrouillé.",
    wrong_external_account_password:
      "Ce mot de passe de compte externe ne correspond pas. Le vérifier dans Paramètres puis réessayer suffit généralement. Votre connexion enregistrée est inchangée.",
    decrypt_wrong_key:
      "Nous n'avons pas la bonne clé pour lire cet e-mail sur cet appareil. Vous déconnecter puis vous reconnecter suffit généralement. Votre e-mail est en sécurité sur le serveur.",
    decrypt_corrupt_ciphertext:
      "Cet e-mail est sur le serveur mais paraît corrompu en transit. Une actualisation et un autre essai suffisent généralement, et hello@astermail.org peut vous aider si cela échoue encore.",
    decrypt_sender_error:
      "L'expéditeur a chiffré cet e-mail d'une manière que nous ne pouvons pas lire. Lui demander de le renvoyer devrait suffire. Vos autres e-mails ne sont pas affectés.",
    metadata_undecryptable_change:
      "Cet appareil ne peut pas ouvrir les détails de ce message, donc votre modification n'est pas enregistrée. Pour recharger vos clés, déconnectez-vous puis reconnectez-vous. Votre message sur le serveur reste inchangé.",
    no_unsubscribe_method:
      "Cet expéditeur n'a pas inclus d'en-tête de désabonnement. Le lien dans l'e-mail lui-même, ou le marquer comme spam, donnera le même résultat.",
    invalid_unsubscribe_address:
      "L'adresse de désabonnement de cet expéditeur semble mal formée. Le lien dans l'e-mail lui-même vous permettra de vous désabonner sur le site de l'expéditeur.",
    tor_unsupported_platform:
      "Tor n'est pas disponible sur cette plateforme. L'application de bureau ou mobile peut acheminer votre connexion via Tor.",
    tor_native_only:
      "Tor n'est disponible que dans l'application native. L'application de bureau ou mobile vous permettra de l'utiliser.",
    tor_plugin_missing:
      "Le module Tor n'est pas installé sur cet appareil. Réinstaller l'application, ou passer à une connexion directe dans Paramètres, vous remettra en ligne.",
    cdn_relay_misconfigured:
      "Le relais CDN n'est pas configuré pour cette version. Passer à une connexion directe dans Paramètres vous remettra en ligne, et hello@astermail.org peut vous aider si besoin.",
    device_repair_required:
      "La clé de cet appareil est manquante. Le ré-appairer depuis votre application de bureau réglera la situation. Votre compte et vos données sont inchangés.",
    device_challenge_mismatch:
      "La vérification d'identité de cet appareil n'a pas correspondu, ce qui peut indiquer une altération. Ré-appairez-le depuis votre application de bureau, et si l'avertissement revient, contactez hello@astermail.org.",
    metadata_migration_stalled:
      "Nous n'avons pas pu terminer la mise à niveau de votre stockage local après plusieurs essais. Vérifier votre connexion et rouvrir Aster suffit généralement. Votre courrier sur le serveur est en sécurité.",
    account_already_added: "Ce compte a déjà été ajouté",
    address_consecutive_dots:
      "L'adresse ne peut pas contenir des points consécutifs",
    address_numeric_only:
      "Une adresse ne peut pas être uniquement des chiffres.",
    address_empty: "L'adresse ne peut pas être vide",
    address_invalid_chars: "L'adresse contient des caractères invalides",
    address_too_long: "L'adresse est trop longue",
    address_too_short: "L'adresse est trop courte",
    alias_consecutive_dots:
      "L'alias ne peut pas contenir des points consécutifs",
    alias_numeric_only:
      "Un nom d'alias ne peut pas être uniquement des chiffres.",
    alias_empty: "L'alias ne peut pas être vide",
    alias_invalid_chars: "L'alias contient des caractères invalides",
    alias_not_available: "Cet alias n'est pas disponible",
    alias_too_long: "L'alias est trop long",
    alias_too_short: "L'alias est trop court",
    all_emails_rejected:
      "Les {{count}} e-mails de ce fichier ont tous été ignorés car chacun était dépourvu d'expéditeur ou de corps, et rien n'a été importé. Vérifier à nouveau l'export source règle généralement le problème.",
    auth_required: "Authentification requise",
    authentication_cancelled: "Authentification annulée",
    authentication_failed: "Authentification échouée",
    authentication_failed_webauthn: "Échec de l'authentification WebAuthn",
    cannot_send_no_keys:
      "Le chiffrement obligatoire est activé et nous n'avons pas de clé pour {{recipients}}. Leur demander de partager une clé, ou désactiver le chiffrement obligatoire dans les Paramètres, permettra l'envoi. Votre brouillon est enregistré.",
    cannot_send_no_recipient_keys:
      "Impossible d'envoyer : clés du destinataire introuvables",
    cannot_send_no_recovery_key:
      "Aster ne peut pas encore envoyer ce message car il manque au compte du destinataire les clés pour le lire. Demandez-lui d'ouvrir Aster sur un appareil ou de mettre à jour son application pour renouveler ces clés, puis réessayez. Votre brouillon est enregistré.",
    conflict: "Conflit détecté",
    connection_failed: "Échec de la connexion",
    daily_limit_reached:
      "Vous avez atteint votre limite d'envoi quotidienne. Une nouvelle tentative dans {{time}} devrait fonctionner. Votre brouillon est enregistré.",
    that_provider: "ce fournisseur",
    too_many_recipients:
      "Ce message compte plus de destinataires qu'un seul message ne peut en atteindre. Votre compte peut envoyer à {{max}} destinataires à la fois, et cette limite augmente au cours de votre première semaine. L'envoi par plus petits groupes fonctionnera. Votre brouillon est enregistré.",
    recipient_concentration:
      "Vous avez écrit à autant d'adresses chez {{domain}} que nous l'autorisons en une heure. Envoyer autant de messages d'un coup à un seul fournisseur fait bloquer nos serveurs de messagerie. Un nouvel essai dans {{time}} fonctionnera. Votre brouillon est enregistré.",
    domain_empty: "Le domaine ne peut pas être vide",
    domain_invalid_chars: "Le domaine contient des caractères invalides",
    domain_invalid_format: "Format de domaine invalide",
    domain_invalid_label: "Label de domaine invalide",
    domain_reserved: "Ce domaine est réservé",
    domain_too_long: "Le domaine est trop long",
    email_skipped_size:
      "L'e-mail {{number}} a été ignoré car il dépasse la limite de 50 Mo. Le reste de votre importation continue.",
    emails_skipped_invalid: "{{count}} e-mail(s) ignoré(s) - invalide(s)",
    encryption_keys_not_loaded: "Clés de chiffrement non chargées",
    encryption_keys_unavailable: "Clés de chiffrement indisponibles",
    failed_decrypt_draft: "Échec du déchiffrement du brouillon",
    failed_encrypt_draft: "Échec du chiffrement du brouillon",
    failed_encrypt_envelope: "Échec du chiffrement de l'enveloppe",
    failed_pgp_encrypt: "pgp_encrypt_failed",
    failed_parse_csv:
      "Ce fichier CSV n'a pas pu être lu : {{error}}. Vérifier à nouveau le fichier règle généralement le problème.",
    failed_parse_email:
      "L'e-mail {{number}} n'a pas pu être lu : {{error}}. Le reste de votre importation continue.",
    failed_parse_eml:
      "Ce fichier EML n'a pas pu être lu : {{error}}. Vérifier à nouveau le fichier règle généralement le problème.",
    failed_parse_pst:
      "Nous n'avons pas pu lire un message dans ce fichier PST : {{error}}. L'exportation depuis Outlook au format MBOX est la solution de contournement.",
    failed_parse_pst_file:
      "Ce fichier PST n'a pas pu être lu : {{error}}. L'exportation depuis votre client de messagerie au format MBOX fonctionne généralement.",
    failed_queue_email: "Échec de la mise en file d'attente de l'e-mail",
    failed_queue_forward: "Échec de la mise en file d'attente du transfert",
    failed_queue_reply: "Échec de la mise en file d'attente de la réponse",
    failed_send: "Échec de l'envoi",
    attachments_too_large:
      "Ces pièces jointes dépassent {{size}} au total, le maximum qu'un message peut transporter avec votre forfait. Retirez ou réduisez un fichier pour pouvoir l'envoyer. Votre brouillon est enregistré.",
    too_many_attachments:
      "Ce message contient plus de {{max}} pièces jointes, le maximum qu'un message peut transporter. Retirez-en quelques-unes pour pouvoir l'envoyer. Votre brouillon est enregistré.",
    failed_send_email: "Échec de l'envoi de l'e-mail",
    failed_send_external: "Échec de l'envoi externe",
    failed_to_list_snoozed: "Échec de la récupération des e-mails reportés",
    failed_to_queue_email: "Échec de la mise en file d'attente de l'e-mail",
    failed_to_send_external_queued:
      "Échec de l'envoi externe en file d'attente",
    failed_to_send_queued: "Échec de l'envoi en file d'attente",
    failed_to_snooze_email: "Échec du report de l'e-mail",
    failed_to_snooze_emails: "Échec du report des e-mails",
    failed_to_unsnooze_email: "Échec de l'annulation du report",
    file_too_large:
      "Ce fichier fait {{size}} Mo, ce qui dépasse la limite de {{limit}} Mo. Un fichier plus petit fonctionnera.",
    health_check_failed: "Échec de la vérification d'état",
    incorrect_password: "Mot de passe incorrect",
    internal_error: "Erreur interne",
    invalid_request: "Requête invalide",
    session_identity_mismatch:
      "Cet appareil était connecté à un autre compte, nous vous avons donc déconnecté pour garder les comptes séparés. Il suffit de vous reconnecter. Vos données sont intactes.",
    key_material_unavailable: "Matériel de clé indisponible",
    max_accounts:
      "Un maximum de {{max}} comptes peuvent être actifs simultanément. En supprimer un libérera une place.",
    no_active_account: "Aucun compte actif",
    no_authenticated_account: "Aucun compte authentifié",
    no_data_in_csv: "Aucune donnée dans le fichier CSV",
    no_emails_in_mbox: "Aucun e-mail trouvé dans le fichier MBOX",
    no_emails_in_pst: "Aucun e-mail trouvé dans le fichier PST",
    no_keys_available: "Aucune clé disponible",
    no_permission: "Permission refusée",
    no_recipients: "Au moins un destinataire est nécessaire avant l'envoi.",
    no_valid_emails_csv: "Aucune adresse e-mail valide dans le CSV",
    pst_conversion_required: "Conversion PST requise",
    rate_limited:
      "Vous faites cela trop rapidement. Veuillez patienter un instant et réessayer.",
    registration_cancelled: "Inscription annulée",
    registration_failed: "Échec de l'inscription",
    request_timeout: "Délai de requête dépassé",
    row_skipped:
      "La ligne {{number}} a été ignorée car il lui manquait des champs obligatoires. Le reste de votre importation continue.",
    session_expired_login: "Session expirée - veuillez vous reconnecter",
    session_expired_reenter:
      "Session expirée - veuillez ré-entrer vos identifiants",
    session_expired_send: "Session expirée - l'envoi a échoué",
    storage_compromised: "Stockage compromis",
    unexpected_error: "Erreur inattendue",
    unexpected_health_check_error:
      "Erreur inattendue lors de la vérification d'état",
    unknown_error: "Erreur inconnue",
    unrecognized_format:
      "Aster ne peut pas lire {{name}}. Les formats pris en charge sont MBOX, EML, CSV et PST. Enregistrez le fichier dans l'un de ces formats et réessayez.",
    version_conflict: "Conflit de version",
    post_quantum_unavailable:
      "Aster protège les messages entre comptes Aster par un chiffrement post-quantique, et {{recipients}} n’a pas encore publié de clés post-quantiques. Demandez à cette personne d’ouvrir Aster ou de mettre à jour son app, puis réessayez. Votre brouillon est enregistré.",
  },
  folder_retention: {
    title: "Nettoyage automatique des dossiers",
    subtitle:
      "Supprimez automatiquement les anciens e-mails d’un dossier. Les e-mails suivis et épinglés sont toujours conservés.",
    add: "Ajouter un nettoyage automatique",
    empty_title: "Aucun dossier en nettoyage automatique",
    empty_description:
      "Choisissez un dossier et une durée de conservation pour le garder rangé automatiquement.",
    edit_title: "Nettoyage automatique du dossier",
    folder: "Dossier",
    select_folder: "Sélectionnez un dossier",
    no_folders:
      "Créez d’abord un dossier personnalisé pour utiliser le nettoyage automatique.",
    retention_period: "Supprimer les e-mails de plus de",
    days_suffix: "jours",
    mode: "Lors du nettoyage",
    mode_trash: "Déplacer vers la corbeille",
    mode_trash_hint: "Récupérable pendant environ 30 jours",
    mode_permanent: "Supprimer définitivement",
    mode_permanent_hint: "Action irréversible",
    mode_archive: "Déplacer vers les archives",
    mode_archive_hint:
      "Retiré de la boîte de réception, conservé et récupérable",
    enabled: "Activé",
    preview_some:
      "Environ {{count}} e-mails seront nettoyés lors du prochain passage.",
    preview_none: "Aucun e-mail ne correspond actuellement à cette règle.",
    keeps_note: "Les e-mails suivis et épinglés sont toujours conservés.",
    save: "Enregistrer",
    cancel: "Annuler",
    delete: "Supprimer",
    remove: "Retirer",
    permanent_confirm:
      "Supprimer définitivement les e-mails de plus de {{days}} jours dans ce dossier ? Cette action est irréversible.",
    summary_older_than: "Plus de {{days}} jours",
    summary_trash: "vers la corbeille",
    summary_permanent: "définitivement",
    summary_archive: "vers les archives",
    card_badge: "Nettoyage automatique",
    disabled_badge: "Désactivé",
    upgrade_title:
      "Le nettoyage automatique des dossiers est une fonctionnalité payante",
    upgrade_body:
      "Passez à Star ou à une offre supérieure pour nettoyer les dossiers automatiquement.",
    save_failed: "Impossible d’enregistrer la règle de nettoyage automatique.",
    load_failed: "Impossible de charger les règles de nettoyage automatique.",
    deleted_toast: "Règle de nettoyage automatique supprimée.",
    saved_toast: "Règle de nettoyage automatique enregistrée.",
  },
  mail_rules: {
    expr_empty_expression: "Saisissez une expression avant d'enregistrer.",
    expr_unterminated_string: "Il manque le guillemet fermant d'une valeur.",
    expr_unexpected_char: 'Le caractère "{{value}}" n\'est pas autorisé ici.',
    expr_unexpected_token:
      "\"{{value}}\" n'est pas attendu ici. Vérifiez l'orthographe, les guillemets et les parenthèses.",
    expr_expected_rparen: "Il manque une parenthèse fermante.",
    expr_expected_field:
      "Saisissez ici un nom de champ, par exemple from.address, subject ou has_attachment.",
    expr_unknown_field:
      '"{{value}}" n\'est pas un champ utilisable. Essayez from.address, subject, body, has_attachment, spam_score ou date_received.',
    expr_expected_operator:
      "Saisissez ici un opérateur, par exemple is, contains, ends_with ou greater_than.",
    expr_expected_string:
      'Saisissez une valeur entre guillemets, par exemple "example.com".',
    expr_expected_number: "Saisissez ici un nombre.",
    expr_invalid_number: "Ce nombre n'est pas valide.",
    expr_expected_is: 'Le mot "is" doit figurer ici.',
    expr_expected_bool_value: "Saisissez ici true ou false.",
    expr_expected_bool_value_got:
      'Saisissez ici true ou false, et non "{{value}}".',
    expr_expected_auth_value: "Saisissez ici pass, fail, none ou missing.",
    expr_expected_auth_value_got:
      'Saisissez ici pass, fail, none ou missing, et non "{{value}}".',
    expr_expected_numeric_op:
      "Saisissez ici une comparaison numérique, par exemple >, <, = ou equals.",
    expr_expected_date_op: "Saisissez ici older_than_days ou newer_than_days.",
    expr_expected_date_op_got:
      'Saisissez ici older_than_days ou newer_than_days, et non "{{value}}".',
    expr_bad_address_op:
      "L'opérateur \"{{value}}\" ne fonctionne pas sur les champs d'adresse. Essayez is, contains, starts_with, ends_with, matches_domain ou matches_regex.",
    expr_bad_text_op:
      'L\'opérateur "{{value}}" ne fonctionne pas sur les champs de texte. Essayez is, contains, starts_with, ends_with, is_empty ou matches_regex.',
    expr_bad_attachment_op:
      'L\'opérateur "{{value}}" ne fonctionne pas sur les noms de pièces jointes. Essayez contains, ends_with ou matches_regex.',
    expr_unhandled_field: "Ce champ ne peut pas être utilisé ici.",
    expr_internal_error:
      "Cette expression n'a pas pu être lue. Vérifiez la syntaxe, puis réessayez.",
    expr_line_col: "(ligne {{line}}, colonne {{col}})",
    editor_description: "Nommez votre règle et indiquez-lui quoi faire.",
    drag_handle: "Poignée de déplacement",
    action_apply_label: "Appliquer une étiquette",
    action_apply_labels: "Appliquer des étiquettes",
    alias_delivery_conflict:
      "L'alias {{ alias }} distribue vers {{ alias_target }}, cette règle qui l'envoie vers {{ rule_target }} l'emportera donc.",
    alias_label_conflict:
      "L'alias {{ alias }} étiquette son courrier avec {{ alias_target }}, cette règle ajoute aussi {{ rule_target }}.",
    action_auto_reply: "Réponse automatique",
    action_categorize: "Catégoriser",
    action_delete: "Supprimer",
    action_forward: "Transférer",
    action_mark_as: "Marquer comme",
    action_move_to: "Déplacer vers",
    action_notify: "Notifier",
    action_pin: "Épingler",
    action_skip_inbox: "Passer la boîte de réception",
    action_snooze: "Reporter",
    action_star: "Marquer d'une étoile",
    add_action: "Ajouter une action",
    add_condition: "Ajouter une condition",
    and_label: "ET",
    applied_count: "Appliqué à {{count}} messages",
    apply_to_existing: "Appliquer au courrier existant maintenant",
    apply_to_existing_started:
      "Application de cette règle à votre courrier existant. Le traitement s'exécute en arrière-plan.",
    apply_to_existing_failed:
      "Impossible de lancer l'application de cette règle.",
    apply_to_existing_cancel: "Arrêter l'application",
    apply_to_existing_cancel_failed: "Impossible d'arrêter cette exécution.",
    apply_to_existing_queued: "En file d'attente...",
    apply_to_existing_progress:
      "Application : {{scanned}} analysés, {{applied}} mis à jour",
    apply_to_existing_progress_total:
      "Application : {{scanned}} sur {{total}} analysés, {{applied}} mis à jour",
    apply_to_existing_done:
      "Terminé : {{scanned}} analysés, {{applied}} mis à jour",
    apply_to_existing_done_encrypted:
      "Terminé : {{scanned}} analysés, {{applied}} mis à jour. Cette règle a ignoré {{encrypted}} messages chiffrés, car seul votre appareil peut les lire.",
    apply_to_existing_canceled: "Arrêté : {{applied}} mis à jour",
    apply_to_existing_canceled_encrypted:
      "Arrêté : {{applied}} mis à jour. Cette règle a ignoré {{encrypted}} messages chiffrés, car seul votre appareil peut les lire.",
    apply_to_existing_error:
      "L'application au courrier existant a echoue. Reessayez.",
    at_limit_upgrade:
      "Vous avez atteint la limite de règles de votre forfait. Mettez à niveau pour en ajouter.",
    auth_fail: "échoué",
    auth_missing: "manquant",
    auth_none: "aucun",
    auth_pass: "réussi",
    cancel: "Annuler",
    cannot_render_visual:
      "Cette règle a des conditions imbriquées que l'éditeur visuel ne peut pas afficher. La vue Expression permet de la modifier.",
    category_forums: "Discussions",
    category_important: "Important",
    category_primary: "Boîte de réception",
    category_promotions: "Bons plans",
    category_social: "Réseaux sociaux",
    category_updates: "Notifications",
    coming_soon: "Bientôt disponible",
    create_rule: "Créer une règle",
    delete: "Supprimer",
    delete_rule_body:
      "Les e-mails entrants ne seront plus filtrés par cette règle.",
    delete_rule_title: "Supprimer la règle ?",
    do_this: "Faire ceci",
    edit_rule: "Modifier la règle",
    empty_cta: "Créer une règle",
    empty_description:
      "Créez votre première règle pour organiser automatiquement vos e-mails entrants.",
    empty_title: "Aucune règle",
    expression_parse_error:
      "Cette expression contient une erreur. Vérifiez la syntaxe.",
    expression_placeholder:
      'from.address est "alice@exemple.com" et subject contient "reçu"',
    field_any_recipient: "N'importe quel destinataire",
    field_attachment_name: "Nom de la pièce jointe",
    field_attachment_size: "Taille de la pièce jointe",
    field_bcc: "Cci",
    field_body: "Corps",
    field_cc: "Cc",
    field_date_received: "Date de réception",
    field_dkim_result: "Résultat DKIM",
    field_dmarc_result: "Résultat DMARC",
    field_from: "De",
    field_has_attachment: "A une pièce jointe",
    field_has_calendar_invite: "A une invitation de calendrier",
    field_has_list_id: "A un List-ID",
    field_header: "En-tête",
    field_is_auto_submitted: "Soumis automatiquement",
    field_is_forward: "Est un transfert",
    field_is_reply: "Est une réponse",
    field_list_id: "List-ID",
    field_recipient_count: "Nombre de destinataires",
    field_reply_to: "Répondre-À",
    field_section_attachments: "Pièces jointes",
    field_section_authentication: "Authentification",
    field_section_content: "Contenu",
    field_section_properties: "Propriétés",
    field_section_recipient: "Destinataire / Expéditeur",
    field_spam_score: "Score de spam",
    field_spf_result: "Résultat SPF",
    field_subject: "Objet",
    field_to: "À/Cc/Cci",
    field_total_size: "Taille totale",
    forward_to_placeholder: "alice@exemple.com",
    header_name_placeholder: "Nom de l'en-tête",
    hint_actions_required:
      "Au moins une action est requise avant d'enregistrer cette règle.",
    hint_categorize_required: "Une catégorie est requise ici.",
    hint_move_to_required: "Le dossier de destination est requis ici.",
    hint_labels_required: "Au moins un libellé est requis ici.",
    hint_condition_incomplete:
      "Chaque condition doit être remplie avant d'enregistrer cette règle.",
    hint_conditions_required:
      "Au moins une condition est requise avant d'enregistrer cette règle.",
    hint_forward_required: "L'adresse e-mail de transfert est requise ici.",
    untitled_rule_name: "Règle sans titre",
    hint_name_required: "Un nom pour cette règle est requis ici.",
    hint_snooze_required: "Une date de report est requise ici.",
    last_action_required:
      "Au moins une action est requise avant d'enregistrer cette règle.",
    last_condition_required:
      "Au moins une condition est requise avant d'enregistrer cette règle.",
    load_failed:
      "Vos règles n'ont pas pu être chargées. Réessayez. Vos règles enregistrées sont en sécurité.",
    match_all: "toutes les conditions",
    match_any: "une des conditions",
    match_case: "Respecter la casse",
    menu_delete: "Supprimer",
    menu_disable: "Désactiver",
    menu_duplicate: "Dupliquer",
    menu_enable: "Activer",
    menu_run_on_existing: "Appliquer au courrier existant",
    more_actions: "Plus d'actions",
    new_rule: "Nouvelle règle",
    no_labels: "Aucune étiquette",
    no_labels_create_hint:
      "Aucune étiquette pour l'instant. Créez-en une depuis la barre latérale.",
    none: "Aucun",
    notify_off: "désactivé",
    notify_on: "activé",
    op_contains: "contient",
    op_does_not_contain: "ne contient pas",
    op_ends_with: "se termine par",
    op_equals: "égal à",
    op_greater_than: "supérieur à",
    op_is: "est",
    op_is_empty: "est vide",
    op_is_not: "n'est pas",
    op_less_than: "inférieur à",
    op_matches_domain: "correspond au domaine",
    op_matches_regex: "correspond à l'expression régulière",
    op_newer_than_days: "plus récent que (jours)",
    op_no: "non",
    op_older_than_days: "plus ancien que (jours)",
    op_starts_with: "commence par",
    op_yes: "oui",
    or_label: "OU",
    pick_a_field: "Choisir un champ",
    pick_an_action: "Choisir une action",
    pick_folder: "Choisir un dossier",
    pick_labels: "Choisir des étiquettes",
    pin_label: "Épingler",
    read: "Lu",
    regex_backreference:
      "Les références arrière comme \\1 ne sont pas prises en charge. Réécrivez le motif sans elles.",
    regex_lookaround:
      "Le lookahead et le lookbehind ne sont pas pris en charge. Réécrivez le motif sans eux.",
    regex_empty: "Un motif regex est requis avant d'enregistrer.",
    regex_invalid: "Ce motif regex contient une erreur. Vérifiez la syntaxe.",
    regex_too_long:
      "Ce regex est trop long. Une version raccourcie fonctionnera.",
    remove_action: "Supprimer l'action",
    reorder_failed:
      "Le nouvel ordre n'a pas été enregistré. Réessayez. Vos règles s'exécutent toujours dans leur ordre précédent.",
    rule_delete_failed:
      "Cette règle n'a pas été supprimée. Réessayez. La règle est toujours active.",
    snooze_needs_future: "Choisissez une date et une heure à venir.",
    rule_color: "Couleur",
    rule_limit_body:
      "Vous avez atteint la limite de règles de votre forfait. Mettez à niveau pour en ajouter.",
    rule_limit_reached: "Limite de règles atteinte",
    rule_name_placeholder: "Nom de la règle",
    save_failed:
      "Cette règle n'a pas été enregistrée. Réessayez. La version précédente est toujours active.",
    save_rule: "Enregistrer la règle",
    snooze_1_day: "1 jour",
    snooze_1_hour: "1 heure",
    snooze_1_week: "1 semaine",
    snooze_3_days: "3 jours",
    snooze_custom: "Date personnalisée",
    subtitle: "Organisez automatiquement vos e-mails entrants.",
    tab_expression: "Expression",
    tab_visual: "Visuel",
    template_placeholder: "Modèle",
    title: "Règles de messagerie",
    unread: "Non lu",
    value_placeholder: "Valeur",
    value_unit_bytes: "o",
    value_unit_days: "jours",
    value_unit_gb: "Go",
    value_unit_kb: "Ko",
    value_unit_mb: "Mo",
    when_mail_matches: "Quand le courrier correspond à",
    your_rules: "Vos règles ({{count}})",
    templates_button: "Modèles",
    templates_title: "Modèles de règles",
    templates_subtitle:
      "Partez d’une règle prête à l’emploi et personnalisez-la avant de l’enregistrer.",
    templates_search_placeholder: "Rechercher des modèles",
    templates_empty: "Aucun modèle ne correspond à votre recherche.",
    templates_use: "Utiliser le modèle",
    templates_customize: "Nécessite une information de votre part",
    templates_category_organize: "Organiser",
    templates_category_cleanup: "Nettoyer",
    templates_category_priority: "Priorité",
    templates_category_security: "Sécurité",
    tpl_folder_auto_clean_name: "Nettoyage automatique des dossiers",
    tpl_folder_auto_clean_desc:
      "Supprime automatiquement les e-mails d’un dossier au-delà du nombre de jours que vous choisissez. Les e-mails suivis et épinglés sont toujours conservés.",
    tpl_newsletters_name: "Trier les newsletters",
    tpl_newsletters_desc:
      "Lorsqu’un message provient d’une liste de diffusion (il porte un en-tête List-Id), classez-le dans la catégorie Notifications.",
    tpl_social_name: "Regrouper les notifications sociales",
    tpl_social_desc:
      "Lorsque l’expéditeur est Facebook, LinkedIn, X/Twitter ou Instagram, déplacez le message dans la catégorie Réseaux sociaux.",
    tpl_promotions_name: "Repérer les promotions",
    tpl_promotions_desc:
      "Lorsque l’objet mentionne soldes, remise, coupon ou « % de réduction », déplacez le message dans la catégorie Offres.",
    tpl_calendar_name: "Regrouper les invitations d’agenda",
    tpl_calendar_desc:
      "Lorsqu’un message contient une invitation d’agenda (.ics), classez-le dans la catégorie Notifications.",
    tpl_large_attachments_name: "Signaler les pièces jointes volumineuses",
    tpl_large_attachments_desc:
      "Lorsqu’un message comporte une pièce jointe de plus de 10 Mo, déplacez-le vers le dossier de votre choix. Choisissez le dossier avant d’enregistrer.",
    tpl_no_reply_name: "Ranger les e-mails automatiques",
    tpl_no_reply_desc:
      "Lorsqu’un message est généré automatiquement (il porte un en-tête Auto-Submitted, par exemple des expéditeurs no-reply), classez-le dans Notifications.",
    tpl_receipts_name: "Archiver les reçus",
    tpl_receipts_desc:
      "Lorsque l’objet mentionne reçu, facture ou confirmation de commande, contournez la boîte de réception et classez le message dans Notifications.",
    tpl_vip_sender_name: "Suivre un expéditeur important",
    tpl_vip_sender_desc:
      "Lorsqu’un e-mail arrive d’un expéditeur de votre choix, suivez-le et envoyez une notification. Saisissez l’adresse de l’expéditeur avant d’enregistrer.",
    tpl_keyword_star_name: "Suivre par mot-clé",
    tpl_keyword_star_desc:
      "Lorsque l’objet contient un mot de votre choix, suivez le message. Saisissez le mot-clé avant d’enregistrer.",
    tpl_auth_failures_name: "Mettre de côté les e-mails suspects",
    tpl_auth_failures_desc:
      "Lorsqu’un message échoue à ses contrôles SPF, DKIM ou DMARC (un signe courant d’usurpation), gardez-le hors de la boîte de réception et marquez-le comme lu.",
  },
  badges: {
    active_badge: "Badge actif",
    badge_andromeda: "Andromède",
    badge_andromeda_description: "A atteint une galaxie voisine.",
    badge_big_bang: "Big Bang",
    badge_big_bang_description: "Premier à découvrir le cosmos.",
    badge_black_hole: "Trou noir",
    badge_black_hole_description: "Attiré par quelque chose de plus profond.",
    badge_comet: "Comète",
    badge_comet_description: "A croisé quelque chose de rare.",
    badge_event_horizon: "Horizon des événements",
    badge_event_horizon_description: "A franchi la frontière du connu.",
    badge_nebula: "Nébuleuse",
    badge_nebula_description: "S'est perdu dans les couleurs.",
    badge_pulsar: "Pulsar",
    badge_pulsar_description: "A entendu le signal dans le bruit.",
    badge_singularity: "Singularité",
    badge_singularity_description: "A trouvé le point où tout se courbe.",
    badge_stargazer: "Observateur d'étoiles",
    badge_stargazer_description: "A regardé au bon moment.",
    badge_supernova: "Supernova",
    badge_supernova_description:
      "A capturé une étoile à son moment le plus brillant.",
    claim_already: "Vous avez déjà obtenu un badge de découverte.",
    claim_failed:
      "Ce badge n'a pas été enregistré. Un nouvel essai devrait suffire.",
    claim_success: "Vous avez obtenu le badge {name}.",
    description: "Des touches personnelles que vous avez collectées.",
    earned_label: "Obtenus",
    empty_state: "Vous n'avez pas encore trouvé de badges.",
    find_order_label: "#{order}",
    granted_at: "Obtenu le {date}",
    none: "Aucun",
    not_earned: "Pas encore obtenu",
    show_in_signature: "Afficher dans la signature",
    show_in_signature_description:
      "Inclure votre badge actif dans les signatures d'e-mails sortants.",
    show_on_profile: "Afficher sur le profil",
    show_on_profile_description:
      "Afficher votre badge actif aux autres utilisateurs d'Aster.",
    title: "Badges",
  },
  secure_view: {
    powered_by_prefix: "Envoyé en toute sécurité via",
    title: "Message sécurisé",
    from: "De",
    expires: "Expire",
    expired: "Ce message sécurisé a expiré et n'est plus disponible.",
    password_prompt:
      "Ce message est protégé. Saisissez le mot de passe pour l'afficher.",
    password_label: "Mot de passe",
    view_button: "Afficher le message",
    unlocking: "Déverrouillage...",
    wrong_password: "Mot de passe incorrect. Veuillez réessayer.",
    locked: "Trop de tentatives. Veuillez réessayer plus tard.",
    decrypt_failed: "Impossible de déchiffrer ce message.",
    loading: "Chargement...",
    not_found: "Ce message sécurisé est introuvable.",
    attachments: "Pièces jointes",
    download: "Télécharger",
    powered_by: "Envoyé en toute sécurité via AsterMail",
    deleted: "Ce message sécurisé a été supprimé et n'est plus disponible.",
    reply_label: "Envoyer une réponse",
    reply_placeholder: "Écrivez votre réponse...",
    reply_button: "Envoyer la réponse",
    reply_sending: "Envoi en cours...",
    reply_sent: "Votre réponse a été envoyée.",
    reply_failed: "Impossible d'envoyer votre réponse. Veuillez réessayer.",
    reply_limit_reached: "Ce message a atteint sa limite de réponses.",
    delete_button: "Supprimer le message",
    delete_confirm_prompt:
      "Supprimer ce message ? Cette action est irréversible.",
    delete_confirm_yes: "Supprimer",
    delete_confirm_no: "Annuler",
    delete_failed: "Impossible de supprimer ce message. Veuillez réessayer.",
  },
  compose: {
    encrypt_external_label: "Chiffrer pour les destinataires externes",
    encrypt_external_desc:
      "Les destinataires ouvrent un lien privé et saisissent un mot de passe pour lire ce message.",
    encrypt_password_required:
      "Définissez un mot de passe pour chiffrer ce message.",
  },
  shared_mailboxes: {
    tab_label: "Boîtes partagées",
    shared_tag: "Partagée",
    create: "Créer",
    created: "Boîte partagée créée",
    create_failed: "Impossible de créer la boîte partagée",
    create_hint:
      "{{count}}/{{max}} boîtes partagées. Toutes les personnes ayant accès lisent et envoient depuis la même adresse.",
    limit_reached: "Votre forfait permet jusqu'à {{max}} boîtes partagées.",
    address_placeholder: "famille",
    empty_title: "Aucune boîte partagée pour l'instant",
    empty_desc:
      "Créez une adresse comme famille@astermail.org que toute votre famille peut lire et utiliser - sans mot de passe supplémentaire.",
    frozen: "Gelée",
    rotation_needed: "Mettre à jour l'accès",
    rotation_explainer:
      "Quelqu'un a perdu l'accès à cette boîte. Renouvelez ses clés pour que les membres retirés ne puissent plus ouvrir les nouveaux messages.",
    rotate: "Renouveler les clés",
    rotated: "Clés de la boîte renouvelées",
    rotate_conflict:
      "La liste des membres a changé pendant le renouvellement. Elle a été actualisée - réessayez.",
    revoke_rotation_pending:
      "Accès retiré, mais les clés n'ont pas pu être renouvelées. Touchez Mettre à jour l'accès - le membre garde l'accès jusque-là.",
    created_grant_pending:
      "Boîte créée, mais la configuration de votre accès a échoué. Ouvrez la ligne de la boîte et accordez-vous l'accès.",
    load_failed_retry:
      "Impossible de charger les boîtes partagées. Touchez pour réessayer.",
    open: "Ouvrir",
    grant_added: "Accès accordé",
    grant_revoked: "Accès retiré",
    has_access: "A accès",
    give_access: "Donner accès",
    always_has_access: "Propriétaire",
    members_heading: "Qui peut utiliser cette boîte",
    storage_line: "{{used}} sur {{total}} utilisés",
    deleted: "Boîte partagée supprimée",
    delete_confirm_button: "Supprimer la boîte",
    delete_confirm_message:
      "Supprimer {{address}} ? L'adresse ne recevra plus de messages et ne pourra plus être enregistrée.",
    delete_confirm_title: "Supprimer la boîte partagée",
    access_unavailable: "Cette boîte partagée n'est plus disponible",
  },
  review_prompt: {
    banner_message:
      "Vous pouvez évaluer Aster Mail sur Trustpilot. Les avis sont publics, et ce message ne s'affiche qu'une fois.",
    banner_open: "Ouvrir Trustpilot",
    banner_dismiss: "Non merci",
    opens_in_new_tab: "Ouvre Trustpilot dans un nouvel onglet",
  },
  survey: {
    banner_title: "Aidez-nous à améliorer Aster Mail",
    banner_message:
      "Aidez à façonner Aster : un sondage unique d'une minute. Vos réponses restent privées et ne sont jamais partagées.",
    banner_take: "Répondre au sondage",
    banner_dismiss: "Ignorer",
    remind_tomorrow: "Me le rappeler demain",
    dismiss_forever: "Ne plus demander",
    modal_title: "Sondage Aster Mail",
    modal_subtitle:
      "Une seule fois, environ une minute. Les questions ouvertes sont facultatives.",
    q_source:
      "Où avez-vous entendu parler d'Aster Mail pour la première fois ?",
    source_reddit: "Reddit",
    source_youtube: "YouTube ou un créateur de contenu",
    source_tiktok_instagram: "TikTok ou Instagram",
    source_friend: "Un ami ou le bouche-à-oreille",
    source_twitter: "X / Twitter",
    source_privacy_directory:
      "Un annuaire de confidentialité (Privacy Guides, PRISM Break, awesome-privacy)",
    source_search_engine: "Moteur de recherche",
    q_signup_reason: "Que cherchiez-vous principalement en vous inscrivant ?",
    signup_e2ee: "Chiffrement de bout en bout",
    signup_leave_big_tech: "Quitter les Big Tech",
    signup_open_source: "Open source",
    signup_specific_feature: "Une fonctionnalité précise",
    signup_price: "Le prix",
    signup_curiosity: "La curiosité",
    q_stood_out: "Qu'est-ce qui a le plus distingué Aster des autres options ?",
    stood_openpgp: "OpenPGP standard, les clés fonctionnent partout",
    stood_post_quantum: "Chiffrement post-quantique",
    stood_open_source: "Open source (AGPL)",
    stood_germany: "Hébergé en Allemagne",
    stood_price: "Le prix",
    stood_ui: "L'interface / la personnalisation",
    q_upgrade_blocker:
      "Qu'est-ce qui vous empêche de passer à un forfait payant ?",
    q_upgrade_trigger:
      "Qu'est-ce qui vous a finalement décidé à prendre un forfait payant ?",
    trigger_storage: "Plus d'espace de stockage",
    trigger_feature: "Je voulais une fonctionnalité précise",
    trigger_support_mission: "Soutenir la mission / le projet",
    trigger_switched_fully: "J'ai quitté complètement un autre fournisseur",
    q_plan_reason: "Pourquoi avez-vous choisi le forfait {{plan}} ?",
    q_cancel_reason: "Qu'est-ce qui vous ferait résilier votre forfait ?",
    q_hesitation:
      "Quelle a été votre plus grande hésitation avant d'acheter un forfait ?",
    hesitation_price: "Le prix",
    hesitation_trust: "Je n'étais pas sûr de pouvoir faire confiance",
    hesitation_missing_feature: "Une fonctionnalité manquante",
    hesitation_longevity: "Je me demandais si Aster allait durer",
    hesitation_none: "Aucune hésitation réelle",
    option_other: "Autre",
    other_placeholder: "Dites-nous en plus",
    open_placeholder: "Votre réponse",
    optional_label: "facultatif",
    required_error: "Veuillez répondre à cette question",
    submit: "Envoyer",
    submit_failed: "Impossible d'envoyer le sondage. Veuillez réessayer.",
    submitted_thanks:
      "Merci ! Vos retours rendent Aster Mail meilleur pour tout le monde. Nous lisons chaque réponse.",
  },
  calendar: {
    invite_yes: "Oui",
    invite_maybe: "Peut-être",
    invite_no: "Non",
    invite_status_going: "Vous participez",
    invite_status_maybe: "Vous participez peut-être",
    invite_status_declined: "Vous ne participez pas",
    invite_change_response: "Modifier",
    invite_added_toast: "Ajouté à votre agenda",
    invite_declined_toast: "Vous avez décliné cette invitation",
    invite_save_failed: "Impossible d'enregistrer dans votre agenda",
    invite_saved_locally: "Enregistré dans votre agenda chiffré",
  },
  settings_search: {
    two_factor: "2FA",
    api_token: "Jeton d'API",
    account_recovery: "Récupération du compte",
    actions: "Actions",
    active_sessions: "Sessions actives",
    add_ons: "Modules complémentaires",
    advanced: "Avancé",
    allowlist: "Liste d'autorisation",
    animations: "Animations",
    app_lock: "Verrouillage de l'app",
    auto_archive: "Archivage automatique",
    auto_forward: "Transfert automatique",
    auto_label: "Étiquette automatique",
    auto_clean: "Nettoyage automatique",
    auto_logout: "Déconnexion automatique",
    auto_update: "Mise à jour automatique",
    badge: "Pastille",
    badge_count: "Compteur de la pastille",
    block: "Bloquer",
    bug_report: "Signalement de bug",
    build_info: "Informations de version",
    changelog: "Nouveautés",
    checkup: "Bilan",
    children: "Enfants",
    children_accounts: "Comptes des enfants",
    code: "Code",
    composing_and_replies: "Rédaction et réponses",
    configuration: "Configuration",
    confirmations: "Confirmations",
    connect_apple_mail: "Connecter Apple Mail",
    connect_thunderbird: "Connecter Thunderbird",
    contact_support: "Contacter l'assistance",
    content_protection: "Protection du contenu",
    control: "Contrôle",
    create: "Créer",
    create_ghost_alias: "Créer un alias fantôme",
    credits: "Crédits",
    crypto: "Crypto",
    custom: "Personnalisé",
    custom_domain: "Domaine personnalisé",
    dns_records: "Enregistrements DNS",
    danger_zone: "Zone sensible",
    dark_mode: "Mode sombre",
    desktop: "Bureau",
    device: "Appareil",
    directories: "Annuaires",
    display: "Affichage",
    domain_verification: "Vérification du domaine",
    domains: "Domaines",
    download: "Télécharger",
    download_bridge: "Télécharger Bridge",
    duration: "Durée",
    duress_pin: "Code PIN de contrainte",
    edit: "Modifier",
    edit_signature: "Modifier la signature",
    email: "E-mail",
    email_forwarding: "Transfert des e-mails",
    email_summary: "Résumé par e-mail",
    events: "Événements",
    export: "Exporter",
    external_accounts: "Comptes externes",
    feature_request: "Suggestion de fonctionnalité",
    features: "Fonctionnalités",
    format: "Format",
    forward: "Transférer",
    generate: "Générer",
    ghost_aliases: "Alias fantômes",
    gmail: "Gmail",
    html_signature: "Signature HTML",
    hardware_keys: "Clés de sécurité",
    imap: "IMAP",
    imap_settings: "Réglages IMAP",
    import_from_imap: "Importer depuis IMAP",
    import_from_proton: "Importer depuis Proton",
    import_key: "Importer une clé",
    invite: "Inviter",
    invite_a_friend: "Inviter un ami",
    invite_family_member: "Inviter un proche",
    invoices: "Factures",
    key_rotation: "Rotation des clés",
    key_algorithm: "Algorithme de la clé",
    keyboard: "Clavier",
    keyboard_shortcuts: "Raccourcis clavier",
    keyboard_navigation: "Navigation au clavier",
    keys: "Clés",
    language: "Langue",
    language_and_format: "Langue et format",
    layout: "Disposition",
    layout_density: "Densité de la disposition",
    light_mode: "Mode clair",
    links: "Liens",
    logs: "Journaux",
    manage: "Gérer",
    manage_family_members: "Gérer les membres de la famille",
    manage_templates: "Gérer les modèles",
    masked_email: "E-mail masqué",
    members: "Membres",
    motion_and_layout: "Animations et disposition",
    navigation_panel: "Volet de navigation",
    notification_sound: "Son des notifications",
    outlook: "Outlook",
    passkeys: "Clés d'accès",
    password: "Mot de passe",
    password_protected_folders: "Dossiers protégés par mot de passe",
    payment: "Paiement",
    payment_method: "Moyen de paiement",
    performance: "Performances",
    plain_text_signature: "Signature en texte brut",
    plan: "Formule",
    position: "Position",
    profile: "Profil",
    proton: "Proton",
    push: "Push",
    quiet_hours: "Heures calmes",
    reading: "Lecture",
    reading_and_conversations: "Lecture et conversations",
    reading_pane: "Volet de lecture",
    recovery: "Récupération",
    referral_code: "Code de parrainage",
    rename_hardware_key: "Renommer la clé de sécurité",
    rename_passkey: "Renommer la clé d'accès",
    report_a_bug: "Signaler un bug",
    request_logs: "Journaux des requêtes",
    revoke_smtp_token: "Révoquer le jeton SMTP",
    revoke_device: "Révoquer l'appareil",
    rotate_encryption_key: "Renouveler la clé de chiffrement",
    smtp_settings: "Réglages SMTP",
    screen_reader: "Lecteur d'écran",
    security: "Sécurité",
    security_checkup: "Bilan de sécurité",
    send_delay: "Délai d'envoi",
    sending: "Envoi",
    session: "Session",
    sessions: "Sessions",
    settings: "Réglages",
    setup: "Configuration initiale",
    sign_out_device: "Déconnecter l'appareil",
    sound: "Son",
    spam: "Spam",
    spam_filter: "Filtre antispam",
    stats: "Statistiques",
    storage: "Stockage",
    storage_add_on: "Module de stockage",
    subscriptions: "Abonnements",
    support: "Assistance",
    swipe: "Balayage",
    system_theme: "Thème du système",
    test: "Test",
    text: "Texte",
    theme: "Thème",
    thread_view: "Vue par conversation",
    threading: "Conversations",
    tokens: "Jetons",
    tracking_protection: "Protection contre le pistage",
    translation: "Traduction",
    undo_send: "Annuler l'envoi",
    vacation_reply: "Réponse d'absence",
    vanguard: "Vanguard",
    vision: "Vision",
  },
};
