import { EquipmentType } from '../database/schemas/equipment.schema';

/**
 * Mapping entre les types d'objets Jira Assets et les types d'équipements MongoDB
 * 
 * Cette configuration définit quels objectTypes de Jira doivent être synchronisés
 * comme équipements et à quel type MongoDB ils correspondent.
 */
export const JIRA_EQUIPMENT_TYPE_MAPPING: Record<string, EquipmentType> = {
    // Laptops et ordinateurs portables
    'Laptop': EquipmentType.PC_PORTABLE,
    'Laptop étudiants': EquipmentType.PC_PORTABLE,
    'Chromebook': EquipmentType.PC_PORTABLE,

    // Écrans
    'Ecrans': EquipmentType.ECRAN,

    // Mobiles et téléphones
    'Mobiles': EquipmentType.MOBILE,

    // Tablettes
    'Tablettes': EquipmentType.TABLETTE,

    // Autres équipements
    'Apple TV': EquipmentType.AUTRE,
    'Visio': EquipmentType.AUTRE,
    'Imprimantes': EquipmentType.AUTRE,
};

/**
 * Liste des types d'objets Jira qui sont des RÉFÉRENCES (attributs)
 * et non des équipements à synchroniser.
 * 
 * Ces types sont utilisés comme attributs dans d'autres objets:
 * - Localisation: attribut de localisation des équipements
 * - Constructeurs: attribut de marque/fabricant
 * - Users: attribut d'utilisateur affecté
 * - Fournisseur: attribut de fournisseur
 * - Operating Systems: attribut de système d'exploitation
 */
export const REFERENCE_OBJECT_TYPES: string[] = [
    'Localisation',
    'Constructeurs',
    'Users',
    'Fournisseur',
    'Operating Systems',
];

/**
 * Vérifie si un objectType Jira est un type d'équipement à synchroniser
 */
export function isEquipmentType(objectTypeName: string): boolean {
    return objectTypeName in JIRA_EQUIPMENT_TYPE_MAPPING;
}

/**
 * Vérifie si un objectType Jira est un type de référence (attribut)
 */
export function isReferenceType(objectTypeName: string): boolean {
    return REFERENCE_OBJECT_TYPES.includes(objectTypeName);
}

/**
 * Récupère le type d'équipement MongoDB correspondant à un objectType Jira
 */
export function getEquipmentType(objectTypeName: string): EquipmentType | undefined {
    return JIRA_EQUIPMENT_TYPE_MAPPING[objectTypeName];
}

/**
 * Récupère tous les noms d'objectTypes qui sont des équipements
 */
export function getAllEquipmentTypeNames(): string[] {
    return Object.keys(JIRA_EQUIPMENT_TYPE_MAPPING);
}
