"""Ce que le backend dit à l'utilisateur, dans sa langue.

Deux problèmes réglés ici.

Les routes renvoyaient le texte de l'exception Python : un arabophone lisait
« search failed: Error code: 529 {'type': 'overloaded_error'} ». Illisible,
jamais traduit, et cela expose nos internes — le message d'un SDK tiers peut
contenir des URL, des en-têtes ou des identifiants de requête. Le détail
n'est pas perdu : il part dans le journal avec sa pile d'appels. Sur Cloud
Run, stderr atterrit dans Cloud Logging, donc `logging.exception` suffit —
sans lui, retirer le détail de la réponse le ferait disparaître pour de bon.

Et tous les refus restaient en français. L'app parle sept langues depuis le
front, mais quelqu'un qui atteignait sa limite mensuelle recevait « Tu as
utilisé tes 10 recherches du mois » quelle que soit la langue choisie. C'est
précisément le message qui précède un abonnement : le lire dans une langue
étrangère ne donne pas envie de payer.

Les textes vivent ici plutôt que dans `lang.py`, qui porte les consignes
envoyées au modèle. Ce sont deux publics différents.
"""
import logging

from fastapi import HTTPException, status

from app.lang import AR, DE, EN, ES, FR, IT, PT

logger = logging.getLogger("smartchef")

Traductions = dict[str, str]

# Un seul message d'échec technique : l'utilisateur n'a qu'une action utile,
# réessayer. Distinguer « modèle saturé » de « délai dépassé » ne change rien
# à ce qu'il peut faire.
IA: Traductions = {
    FR: "Le service n'a pas répondu. Réessaie dans un instant.",
    EN: "The service didn't respond. Try again in a moment.",
    ES: "El servicio no respondió. Inténtalo de nuevo en un momento.",
    PT: "O serviço não respondeu. Tente novamente em instantes.",
    IT: "Il servizio non ha risposto. Riprova tra un istante.",
    DE: "Der Dienst hat nicht geantwortet. Versuche es gleich noch einmal.",
    AR: "لم يستجب الخادم. حاول مرة أخرى بعد قليل.",
}

PAIEMENT: Traductions = {
    FR: "Le paiement n'a pas pu démarrer. Réessaie dans un instant.",
    EN: "Checkout couldn't start. Try again in a moment.",
    ES: "No se pudo iniciar el pago. Inténtalo de nuevo en un momento.",
    PT: "Não foi possível iniciar o pagamento. Tente novamente em instantes.",
    IT: "Non è stato possibile avviare il pagamento. Riprova tra un istante.",
    DE: "Die Zahlung konnte nicht gestartet werden. Versuche es gleich noch einmal.",
    AR: "تعذر بدء عملية الدفع. حاول مرة أخرى بعد قليل.",
}

DEJA_ABONNE: Traductions = {
    FR: "Tu es déjà abonné.",
    EN: "You're already subscribed.",
    ES: "Ya tienes una suscripción.",
    PT: "Você já é assinante.",
    IT: "Sei già abbonato.",
    DE: "Du hast bereits ein Abo.",
    AR: "أنت مشترك بالفعل.",
}

PAIEMENT_INACTIF: Traductions = {
    FR: "Le paiement n'est pas encore activé.",
    EN: "Payments aren't switched on yet.",
    ES: "Los pagos aún no están activados.",
    PT: "Os pagamentos ainda não estão ativados.",
    IT: "I pagamenti non sono ancora attivi.",
    DE: "Zahlungen sind noch nicht aktiviert.",
    AR: "لم يتم تفعيل الدفع بعد.",
}

# {fonctionnalite} et {prix} sont remplacés à l'appel.
ESSAI_TERMINE: Traductions = {
    FR: "Ton essai est terminé. {fonctionnalite} reste disponible avec Premium ({prix} €/mois).",
    EN: "Your trial is over. {fonctionnalite} is still available with Premium (€{prix}/month).",
    ES: "Tu prueba ha terminado. {fonctionnalite} sigue disponible con Premium ({prix} €/mes).",
    PT: "Seu teste terminou. {fonctionnalite} continua disponível com o Premium ({prix} €/mês).",
    IT: "La tua prova è finita. {fonctionnalite} resta disponibile con Premium ({prix} €/mese).",
    DE: "Deine Testphase ist vorbei. {fonctionnalite} bleibt mit Premium verfügbar ({prix} €/Monat).",
    AR: "انتهت فترتك التجريبية. {fonctionnalite} يبقى متاحًا مع بريميوم ({prix} € شهريًا).",
}

QUOTA: Traductions = {
    FR: "Tu as utilisé tes {limite} {label} du mois.",
    EN: "You've used your {limite} {label} for this month.",
    ES: "Has usado tus {limite} {label} del mes.",
    PT: "Você usou suas {limite} {label} do mês.",
    IT: "Hai usato le tue {limite} {label} del mese.",
    DE: "Du hast deine {limite} {label} für diesen Monat aufgebraucht.",
    AR: "لقد استخدمت {limite} {label} لهذا الشهر.",
}

QUOTA_SUITE_GRATUIT: Traductions = {
    FR: " Passe en Premium pour en avoir plus.",
    EN: " Go Premium for more.",
    ES: " Pásate a Premium para tener más.",
    PT: " Mude para o Premium para ter mais.",
    IT: " Passa a Premium per averne di più.",
    DE: " Mit Premium bekommst du mehr.",
    AR: " اشترك في بريميوم للحصول على المزيد.",
}

QUOTA_SUITE_PAYANT: Traductions = {
    FR: " Le compteur repart le 1er du mois.",
    EN: " The counter resets on the 1st.",
    ES: " El contador se reinicia el día 1.",
    PT: " O contador zera no dia 1º.",
    IT: " Il contatore riparte il 1° del mese.",
    DE: " Der Zähler startet am 1. neu.",
    AR: " يُعاد ضبط العداد في اليوم الأول من الشهر.",
}

# Sujets de phrase : « Le plan de la semaine reste disponible avec Premium ».
FONCTIONNALITES: dict[str, Traductions] = {
    "meal_plan": {
        FR: "Le plan de la semaine", EN: "The weekly plan",
        ES: "El plan semanal", PT: "O plano da semana",
        IT: "Il piano settimanale", DE: "Der Wochenplan",
        AR: "خطة الأسبوع",
    },
    "shopping": {
        FR: "La liste de courses", EN: "The shopping list",
        ES: "La lista de la compra", PT: "A lista de compras",
        IT: "La lista della spesa", DE: "Die Einkaufsliste",
        AR: "قائمة التسوق",
    },
    "_defaut": {
        FR: "Cette fonctionnalité", EN: "This feature",
        ES: "Esta función", PT: "Este recurso",
        IT: "Questa funzione", DE: "Diese Funktion",
        AR: "هذه الميزة",
    },
}

# Au pluriel : « tes 10 recherches du mois ».
LABELS: dict[str, Traductions] = {
    "vision": {
        FR: "scans", EN: "scans", ES: "escaneos", PT: "escaneamentos",
        IT: "scansioni", DE: "Scans", AR: "عمليات مسح",
    },
    "search": {
        FR: "recherches", EN: "searches", ES: "búsquedas", PT: "buscas",
        IT: "ricerche", DE: "Suchen", AR: "عمليات بحث",
    },
    "meal_plan": {
        FR: "plans de repas", EN: "meal plans", ES: "planes de comidas",
        PT: "planos de refeições", IT: "piani dei pasti",
        DE: "Essenspläne", AR: "خطط وجبات",
    },
    "shopping": {
        FR: "listes de courses", EN: "shopping lists",
        ES: "listas de la compra", PT: "listas de compras",
        IT: "liste della spesa", DE: "Einkaufslisten",
        AR: "قوائم تسوق",
    },
}


def texte(traductions: Traductions, lang: str, **variables) -> str:
    """Le texte dans `lang`, ou en français si la langue est inconnue.

    Le français est le repli parce que c'est la langue de rédaction : une clé
    y existe toujours, alors qu'une traduction peut manquer.
    """
    modele = traductions.get(lang) or traductions[FR]
    return modele.format(**variables) if variables else modele


def _echec(traductions: Traductions, operation: str, exc: Exception, lang: str):
    # Appelé depuis un bloc `except`, donc `exception()` capture la pile.
    logger.exception("%s : %s", operation, exc.__class__.__name__)
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=texte(traductions, lang),
    )


def ia_indisponible(operation: str, exc: Exception, lang: str) -> HTTPException:
    """À lever quand un appel au modèle échoue, quelle qu'en soit la cause."""
    return _echec(IA, operation, exc, lang)


def paiement_indisponible(operation: str, exc: Exception, lang: str) -> HTTPException:
    return _echec(PAIEMENT, operation, exc, lang)
