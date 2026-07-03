export const BUILDS = [
    {
        id: "fastfood",
        title: "FASTFOOD",
        name: "Фастфуд",
        assetName: "Fastfood",
        subtitle: "Ну ты дурак?",
        image: "resources/img/modpacks/fastfood/panoramas/final_adam39_1/panorama_0.png",
        icon: "resources/img/modpacks/fastfood/item.png",
        minecraftVersion: "1.12.2",
        panoramas: [
            "resources/img/modpacks/fastfood/panoramas/final_adam39_1",
            "resources/img/modpacks/fastfood/panoramas/final_adam39_2",
            "resources/img/modpacks/fastfood/panoramas/final_antegripin_1",
            "resources/img/modpacks/fastfood/panoramas/final_antegripin_2",
            "resources/img/modpacks/fastfood/panoramas/final_antegripin_3",
            "resources/img/modpacks/fastfood/panoramas/final_explosed_adam39",
            "resources/img/modpacks/fastfood/panoramas/final_explosed_home",
            "resources/img/modpacks/fastfood/panoramas/final_explosed_luzhniki",
            "resources/img/modpacks/fastfood/panoramas/final_fgg5_1",
            "resources/img/modpacks/fastfood/panoramas/final_fgg5_2",
            "resources/img/modpacks/fastfood/panoramas/final_home_1",
            "resources/img/modpacks/fastfood/panoramas/final_home_angar_1",
            "resources/img/modpacks/fastfood/panoramas/final_home_angar_2",
            "resources/img/modpacks/fastfood/panoramas/final_home_angar_3",
            "resources/img/modpacks/fastfood/panoramas/final_home_angar_4",
            "resources/img/modpacks/fastfood/panoramas/final_luzniki_1",
            "resources/img/modpacks/fastfood/panoramas/final_luzniki_2",
            "resources/img/modpacks/fastfood/panoramas/final_luzniki_3",
            "resources/img/modpacks/fastfood/panoramas/final_luzniki_4",
            "resources/img/modpacks/fastfood/panoramas/final_luzniki_5"
        ],
        mods: ["jei", "journeymap"]
    },
    {
        id: "duoskuchno",
        title: "DUOSKUCHNO",
        name: "ДуоСкучно",
        assetName: "DuoSkuchno",
        subtitle: "Ну что? В бед идём?",
        image: "resources/img/modpacks/duoskuchno/panoramas/main/panorama_0.png",
        icon: "resources/img/modpacks/duoskuchno/item.png",
        panoramas: [
            "resources/img/modpacks/duoskuchno/panoramas/main"
        ],
        mods: []
    }
];

export const MODS = {
    "1.7.10": {},
    "1.12.2": {
        jei: {
            name: "Just Enough Items",
            version: "4.16.1.302",
            url: "https://www.curseforge.com/minecraft/mc-mods/jei",
            description: "показывает рецепты и способы применения предметов прямо в игре."
        },
        journeymap: {
            name: "JourneyMap",
            version: "5.7.1",
            url: "https://www.curseforge.com/minecraft/mc-mods/journeymap",
            description: "добавляет миникарту, большую карту мира и метки."
        }
    },
    "1.16.5": {},
    "1.19.2": {},
    "1.20.1": {}
};

export const FAQS = [
    {
        question: "Как юзать сайт?",
        answer: [
            "Предметы в хотбаре инвентаря сверху - это сборки. Нажимаешь на него, чтобы открыть вкладку сборки.",
            "",
            "Во вкладке **/скачать** лежат архивы сборок. Обозначения рядом с архивами:",
        ].join("\n"),
        legend: [
            { badge: "requirement", variant: "required", label: "!", text: "обязательный архив, его надо качать." },
            { badge: "requirement", variant: "optional", label: "*", text: "необязательный архив." },
            { badge: "kind", variant: "version", label: "версия", text: "полноценная версия сборки для ТЛ." },
            { badge: "kind", variant: "addition", label: "дополнение", text: "патч / аддон к сборке." }
        ],
        after: [
            "- **/чё_обновилось** открывает описание обновы.",
            "",
            "Если инвентарь мешает или глючит, жмай **/отключить_инвентарь**, на странице останутся только сборки."
        ].join("\n")
    },
    {
        question: "Метки в жорней или ксаеро мапе пропали((((",
        answer: [
            "лох"
            // "Обычно метки живут не в архиве сборки, а в папке конкретного инстанса Minecraft. Если ты заменил папку целиком, лаунчер мог создать новый мир данных карты, и старые waypoint-файлы остались в прошлой установке.",
            // "",
            // "Что проверить:",
            // "",
            // "- Для **JourneyMap** ищи старую папку `journeymap/data/` в предыдущем инстансе.",
            // "- Для **Xaero** проверь файлы `XaeroWaypoints...txt` и папки `xaeroworldmap` / `xaerominimap` рядом с конфигами.",
            // "- Если сервер поменял адрес, порт или имя мира, мод может считать это новой картой. Старые метки можно перенести вручную в новую папку мира.",
            // "",
            // "Перед переносом лучше закрыть игру и сделать копию папки инстанса. Да, скучно, зато потом не придётся второй раз ловить сердечко в пятки."
        ].join("\n")
    }
];

export const SKINS = [
    "resources/models/skins/NurKhabib_1.glb",
    "resources/models/skins/NurKhabib_2.glb",
    "resources/models/skins/NurKhabib_3.glb",
    "resources/models/skins/NurKhabib_4.glb",
    "resources/models/skins/NurKhabib_5.glb",
    "resources/models/skins/HeFor232.glb",
    "resources/models/skins/reduktevit.glb",
    "resources/models/skins/Neooo39_1.glb",
    "resources/models/skins/Neooo39_2.glb",
    "resources/models/skins/fgg5_1.glb",
    "resources/models/skins/fgg5_2.glb",
    "resources/models/skins/Kail_Krane.glb",
    "resources/models/skins/Vortex2039.glb",
    "resources/models/skins/ivan_zolik2004_2_1.glb"
];

