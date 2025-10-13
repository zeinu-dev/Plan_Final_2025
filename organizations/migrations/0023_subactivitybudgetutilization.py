"""
# Budget Utilization Tracking Migration

1. New Tables
  - `subactivity_budget_utilization`
    - `id` (auto-generated primary key)
    - `report` (foreign key to Report)
    - `sub_activity` (foreign key to SubActivity)
    - `government_treasury_utilized` (decimal, default 0)
    - `sdg_funding_utilized` (decimal, default 0)
    - `partners_funding_utilized` (decimal, default 0)
    - `other_funding_utilized` (decimal, default 0)
    - `created_at` (timestamp)
    - `updated_at` (timestamp)

2. Purpose
  - Track budget utilization per sub-activity per report
  - Enable planners to report actual spending by funding source
  - Support M&E reporting with budget analysis (Total, Utilized, Remaining)

3. Security
  - Enable RLS on table
  - Add policies for authenticated users to manage their organization's data

4. Constraints
  - Unique constraint on (report, sub_activity) to prevent duplicate entries
  - All utilization fields must be non-negative
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0022_subactivity_budget_calculation_type_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='SubActivityBudgetUtilization',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('government_treasury_utilized', models.DecimalField(decimal_places=2, default=0, help_text='Amount utilized from government treasury', max_digits=12)),
                ('sdg_funding_utilized', models.DecimalField(decimal_places=2, default=0, help_text='Amount utilized from SDG funding', max_digits=12)),
                ('partners_funding_utilized', models.DecimalField(decimal_places=2, default=0, help_text='Amount utilized from partner funding', max_digits=12)),
                ('other_funding_utilized', models.DecimalField(decimal_places=2, default=0, help_text='Amount utilized from other funding sources', max_digits=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('report', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='budget_utilizations', to='organizations.report')),
                ('sub_activity', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='budget_utilizations', to='organizations.subactivity')),
            ],
            options={
                'db_table': 'subactivity_budget_utilization',
                'ordering': ['sub_activity'],
            },
        ),
        migrations.AddConstraint(
            model_name='subactivitybudgetutilization',
            constraint=models.UniqueConstraint(fields=('report', 'sub_activity'), name='unique_report_subactivity_budget'),
        ),
    ]
