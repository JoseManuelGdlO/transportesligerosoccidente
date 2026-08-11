import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class MaintenanceCategory extends Model<
  InferAttributes<MaintenanceCategory>,
  InferCreationAttributes<MaintenanceCategory>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare nombre: string;
  declare descripcion: CreationOptional<string | null>;
  declare estatus: CreationOptional<"activo" | "inactivo">;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initMaintenanceCategory(sequelize: Sequelize) {
  MaintenanceCategory.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      nombre: { type: DataTypes.STRING(120), allowNull: false },
      descripcion: { type: DataTypes.STRING(255), allowNull: true },
      estatus: {
        type: DataTypes.ENUM("activo", "inactivo"),
        allowNull: false,
        defaultValue: "activo",
      },
    } as never,
    { sequelize, tableName: "maintenance_categories", underscored: true },
  );
}
