export const BUILDS = [
    {
        id: "fastfood",
        title: "FASTFOOD",
        name: "Фастфуд",
        assetName: "Fastfood",
        subtitle: "Ну ты дурак?",
        image: "resources/img/fastfood/panoramas/final_adam39_1/panorama_0.png",
        icon: "resources/img/fastfood/item.png",
        panoramas: [
            "resources/img/fastfood/panoramas/final_adam39_1",
            "resources/img/fastfood/panoramas/final_adam39_2",
            "resources/img/fastfood/panoramas/final_antegripin_1",
            "resources/img/fastfood/panoramas/final_antegripin_2",
            "resources/img/fastfood/panoramas/final_antegripin_3",
            "resources/img/fastfood/panoramas/final_explosed_adam39",
            "resources/img/fastfood/panoramas/final_explosed_home",
            "resources/img/fastfood/panoramas/final_explosed_luzhniki",
            "resources/img/fastfood/panoramas/final_fgg5_1",
            "resources/img/fastfood/panoramas/final_fgg5_2",
            "resources/img/fastfood/panoramas/final_home_1",
            "resources/img/fastfood/panoramas/final_home_angar_1",
            "resources/img/fastfood/panoramas/final_home_angar_2",
            "resources/img/fastfood/panoramas/final_home_angar_3",
            "resources/img/fastfood/panoramas/final_home_angar_4",
            "resources/img/fastfood/panoramas/final_luzniki_1",
            "resources/img/fastfood/panoramas/final_luzniki_2",
            "resources/img/fastfood/panoramas/final_luzniki_3",
            "resources/img/fastfood/panoramas/final_luzniki_4",
            "resources/img/fastfood/panoramas/final_luzniki_5"
        ],
        mods: []
    },
    {
        id: "duoskuchno",
        title: "DUOSKUCHNO",
        name: "ДуоСкучно",
        assetName: "DuoSkuchno",
        subtitle: "Ну что? В бед идём?",
        image: "resources/img/duoskuchno/panoramas/main/panorama_0.png",
        icon: "resources/img/duoskuchno/item.png",
        panoramas: [
            "resources/img/duoskuchno/panoramas/main"
        ],
        mods: []
    }
];

export const FAQS = [
    {
        question: "Как юзать сайт?",
        answer: [
            "лох"
            // "Выбираешь сборку в инвентаре сверху: предмет в хотбаре открывает карточку сборки, а стрелки листают скины чисто для настроения.",
            // "",
            // "Внутри карточки есть три главные команды:",
            // "",
            // "- **/чё_за** показывает версию Minecraft, версию сборки и список модов, если он указан.",
            // "- **/скачать** берёт самый свежий архив из GitHub Releases и держит старые версии рядом.",
            // "- **/обновы** показывает markdown-описание релизов, чтобы было понятно, что поменялось.",
            // "",
            // "Если инвентарь мешает, жми **/отключить_инвентарь**. Сборки останутся на странице, просто управление станет компактнее."
        ].join("\n")
    },
    {
        question: "Метки в жорней / ксаеро мапе пропали((((",
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

